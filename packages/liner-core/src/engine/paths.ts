import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type EngineManifest = {
  engine: string;
  version: string;
  platform: string;
  arch: string;
  builtAt: string;
};

export type EngineSource = 'bundled' | 'dev' | 'none';

/** `electronDist` is `apps/liner-electron/dist` in dev. */
export function resolveRepoRootFromElectronDist(electronDist: string): string {
  return join(electronDist, '..', '..', '..');
}

export function resolveOpencodeEngineRoot(opts: {
  isPackaged: boolean;
  resourcesPath?: string;
  repoRoot?: string;
  engineRootOverride?: string;
}): { root: string; source: EngineSource } {
  if (opts.engineRootOverride) {
    const override = opts.engineRootOverride;
    const bundled = existsSync(join(override, 'manifest.json'));
    return {
      root: override,
      source: bundled ? 'bundled' : 'dev',
    };
  }
  if (opts.isPackaged && opts.resourcesPath) {
    return {
      root: join(opts.resourcesPath, 'opencode-engine'),
      source: 'bundled',
    };
  }
  const repo = opts.repoRoot ?? process.cwd();
  return {
    root: join(repo, 'apps', 'liner-electron', 'build', 'opencode'),
    source: 'dev',
  };
}

export function readEngineManifest(engineRoot: string): EngineManifest | null {
  const path = join(engineRoot, 'manifest.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as EngineManifest;
  } catch {
    return null;
  }
}

export function resolveOpencodeBinary(
  isPackaged: boolean,
  engineRoot: string,
): string | null {
  const bundled = join(engineRoot, 'bin', 'opencode');
  if (existsSync(bundled)) return bundled;
  if (!isPackaged) {
    const devBundled = join(
      engineRoot,
      'bin',
      process.platform === 'darwin'
        ? process.arch === 'arm64'
          ? 'opencode-darwin-arm64'
          : 'opencode-darwin-x64'
        : 'opencode',
    );
    if (existsSync(devBundled)) return devBundled;
  }
  return null;
}

export function resolveBunExecutable(opts: {
  isPackaged: boolean;
  resourcesPath?: string;
}): { path: string | null; source: 'bundled' | 'system' | 'none' } {
  if (opts.isPackaged && opts.resourcesPath) {
    const bundled = join(opts.resourcesPath, 'runtime', 'bun');
    if (existsSync(bundled)) return { path: bundled, source: 'bundled' };
  }

  const candidates = [
    process.env.BUN_INSTALL
      ? join(process.env.BUN_INSTALL, 'bin', 'bun')
      : null,
    join(homedir(), '.bun', 'bin', 'bun'),
    '/opt/homebrew/bin/bun',
    '/usr/local/bin/bun',
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (existsSync(p)) return { path: p, source: 'system' };
  }

  return { path: null, source: 'none' };
}
