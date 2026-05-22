import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createOpencodeServer } from '@opencode-ai/sdk';
import { linerAuthPath } from '../provider-auth';
import type { EngineState } from '../engine-info';
import { isOpencodeServerReachable } from '../rpc/opencode-detect';
import {
  readEngineManifest,
  resolveOpencodeBinary,
  resolveOpencodeEngineRoot,
  type EngineSource,
} from './paths';

export type ManagedEngineResult = {
  state: EngineState;
  error: string | null;
  version: string | null;
  platform?: string;
  arch?: string;
  source: EngineSource;
  started: boolean;
  reason?: 'already-running' | 'spawned' | 'no-entry' | 'spawn-failed';
};

export type StartManagedEngineOptions = {
  isPackaged: boolean;
  resourcesPath?: string;
  repoRoot?: string;
  engineRootOverride?: string;
  opencodePort?: number;
  opencodeBaseUrl?: string;
  waitTimeoutMs?: number;
  pipeStdio?: boolean;
};

let opencodeProcess: ChildProcess | null = null;
let managedServerClose: (() => void) | null = null;
let managedStartedByUs = false;
let startEnginePromise: Promise<ManagedEngineResult> | null = null;

export function applyEngineEnv(result: ManagedEngineResult): void {
  process.env.LINER_ENGINE_NAME = 'opencode';
  process.env.LINER_ENGINE_STATE = result.state;
  process.env.LINER_ENGINE_VERSION = result.version ?? '';
  process.env.LINER_ENGINE_ERROR = result.error ?? '';
  process.env.LINER_ENGINE_SOURCE = result.source;
  process.env.LINER_ENGINE_PLATFORM = result.platform ?? '';
  process.env.LINER_ENGINE_ARCH = result.arch ?? '';
}

export async function startManagedEngine(
  opts: StartManagedEngineOptions,
): Promise<ManagedEngineResult> {
  if (startEnginePromise) return startEnginePromise;
  startEnginePromise = startManagedEngineInner(opts).finally(() => {
    startEnginePromise = null;
  });
  return startEnginePromise;
}

async function startManagedEngineInner(
  opts: StartManagedEngineOptions,
): Promise<ManagedEngineResult> {
  const port = opts.opencodePort ?? Number(process.env.OPENCODE_PORT ?? 4096);
  const baseUrl =
    opts.opencodeBaseUrl ??
    process.env.OPENCODE_BASE_URL ??
    `http://127.0.0.1:${port}`;
  const waitTimeoutMs =
    opts.waitTimeoutMs ?? (opts.isPackaged ? 120_000 : 45_000);

  const { root: engineRoot, source } = resolveOpencodeEngineRoot({
    isPackaged: opts.isPackaged,
    resourcesPath: opts.resourcesPath,
    repoRoot: opts.repoRoot,
    engineRootOverride: opts.engineRootOverride,
  });

  const manifest = readEngineManifest(engineRoot);
  const version = manifest?.version ?? null;
  const platform = manifest?.platform;
  const arch = manifest?.arch;

  const alreadyUp = await isOpencodeServerReachable(baseUrl, 2500);
  if (alreadyUp) {
    return {
      state: 'ready',
      error: null,
      version,
      platform,
      arch,
      source,
      started: false,
      reason: 'already-running',
    };
  }

  const binary = resolveOpencodeBinary(opts.isPackaged, engineRoot);
  if (!binary && !commandOnPath('opencode')) {
    const msg = opts.isPackaged
      ? 'Bundled OpenCode binary not found. Rebuild with `bun run build:engine`.'
      : 'OpenCode not found. Install: curl -fsSL https://opencode.ai/install | bash — or set PATH to include `opencode`.';
    return {
      state: opts.isPackaged ? 'failed' : 'unavailable',
      error: msg,
      version,
      platform,
      arch,
      source,
      started: false,
      reason: 'no-entry',
    };
  }

  try {
    applyEngineEnv({
      state: 'starting',
      error: null,
      version,
      platform,
      arch,
      source,
      started: true,
    });

    process.env.OPENCODE_AUTH_PATH = linerAuthPath();
    process.env.OPENCODE_CONFIG_DIR = join(homedir(), '.liner');

    if (binary && existsSync(binary)) {
      const server = await spawnBundledOpencode(binary, port, waitTimeoutMs, opts);
      managedServerClose = server.close;
      managedStartedByUs = true;
    } else {
      const server = await createOpencodeServer({
        hostname: '127.0.0.1',
        port,
        timeout: waitTimeoutMs,
      });
      managedServerClose = server.close;
      managedStartedByUs = true;
      process.env.OPENCODE_BASE_URL = server.url;
    }

    const reachable = await isOpencodeServerReachable(
      process.env.OPENCODE_BASE_URL ?? baseUrl,
      waitTimeoutMs,
    );
    if (!reachable) {
      return {
        state: 'failed',
        error: 'OpenCode port open but API probe failed',
        version,
        platform,
        arch,
        source,
        started: true,
        reason: 'spawn-failed',
      };
    }

    return {
      state: 'ready',
      error: null,
      version,
      platform,
      arch,
      source,
      started: true,
      reason: 'spawned',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'OpenCode failed to start';
    stopManagedEngine();
    return {
      state: 'failed',
      error: msg,
      version,
      platform,
      arch,
      source,
      started: false,
      reason: 'spawn-failed',
    };
  }
}

function spawnBundledOpencode(
  binary: string,
  port: number,
  timeoutMs: number,
  opts: StartManagedEngineOptions,
): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve, reject) => {
    const args = ['serve', `--hostname=127.0.0.1`, `--port=${port}`];
    const child = spawn(binary, args, {
      stdio: opts.pipeStdio ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      detached: false,
      env: {
        ...process.env,
        OPENCODE_AUTH_PATH: linerAuthPath(),
        OPENCODE_CONFIG_DIR: join(homedir(), '.liner'),
      },
    });
    opencodeProcess = child;
    const deadline = Date.now() + timeoutMs;
    let output = '';
    let resolved = false;

    const finish = (url: string) => {
      if (resolved) return;
      resolved = true;
      resolve({
        url,
        close: () => {
          child.kill();
          opencodeProcess = null;
        },
      });
    };

    child.stdout?.on('data', (chunk) => {
      output += String(chunk);
      const match = output.match(/on\s+(https?:\/\/[^\s]+)/);
      if (match) finish(match[1]);
    });

    child.on('exit', (code) => {
      if (!resolved) {
        reject(new Error(`OpenCode exited (code ${code ?? 'unknown'})`));
      }
    });

    child.on('error', reject);

    const poll = async () => {
      const url = `http://127.0.0.1:${port}`;
      if (await isOpencodeServerReachable(url, 2000)) {
        finish(url);
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error(`Timeout waiting for OpenCode on port ${port}`));
        return;
      }
      setTimeout(poll, 500);
    };
    void poll();
  });
}

export function stopManagedEngine(): void {
  if (managedServerClose && managedStartedByUs) {
    managedServerClose();
  }
  if (opencodeProcess && managedStartedByUs) {
    opencodeProcess.kill();
  }
  managedServerClose = null;
  opencodeProcess = null;
  managedStartedByUs = false;
}

export function isManagedEngineEnabled(): boolean {
  return (
    process.env.LINER_MANAGED_ENGINE !== '0' &&
    process.env.LINER_RPC_MODE !== 'mock'
  );
}

function commandOnPath(cmd: string): boolean {
  const result = Bun.spawnSync(['which', cmd]);
  return result.exitCode === 0;
}
