import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** `electronDist` is `apps/liner-electron/dist` in dev. */
export function resolveRepoRoot(electronDist: string): string {
  return join(electronDist, '..', '..', '..');
}

export function resolveBunExecutable(opts: {
  isPackaged: boolean;
  resourcesPath: string;
}): { path: string | null; source: 'bundled' | 'system' | 'none' } {
  if (opts.isPackaged) {
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
