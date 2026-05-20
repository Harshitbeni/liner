import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export type EngineManifest = {
  engine: string;
  version: string;
  platform: string;
  arch: string;
  builtAt: string;
  craftBuildScript?: string;
};

export type EngineState =
  | 'starting'
  | 'ready'
  | 'failed'
  | 'mock-fallback'
  | 'dev'
  | 'unavailable';

/** `electronDist` is `apps/liner-electron/dist` in dev. */
export function resolveRepoRoot(electronDist: string): string {
  return join(electronDist, '..', '..', '..');
}

export function resolveCraftEngineRoot(
  isPackaged: boolean,
  resourcesPath: string,
  repoRoot: string,
): { root: string; source: 'bundled' | 'dev' } {
  if (isPackaged) {
    return {
      root: join(resourcesPath, 'craft-engine'),
      source: 'bundled',
    };
  }
  return {
    root: join(repoRoot, 'vendor', 'craft-agents-oss'),
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

export function resolveCraftServerEntry(
  isPackaged: boolean,
  engineRoot: string,
): string | null {
  const bundled = join(engineRoot, 'bin', 'craft-server');
  if (existsSync(bundled)) return bundled;

  if (!isPackaged) {
    const devEntry = join(engineRoot, 'packages', 'server', 'src', 'index.ts');
    if (existsSync(devEntry)) return devEntry;
  }
  return null;
}

export function resolveBunExecutable(
  isPackaged: boolean,
  resourcesPath: string,
): { path: string | null; source: 'bundled' | 'system' | 'none' } {
  if (isPackaged) {
    const bundled = join(resourcesPath, 'runtime', 'bun');
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
