#!/usr/bin/env bun
/**
 * Stage Bun binary for packaged Liner API (Electron extraResources/runtime).
 *
 *   bun run prepare:runtime
 */
import { existsSync, mkdirSync, chmodSync, copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..');
const OUT_DIR = join(REPO_ROOT, 'apps', 'liner-electron', 'build', 'runtime');
const BUN_OUT = join(OUT_DIR, 'bun');

async function resolveSystemBun(): Promise<string | null> {
  try {
    const which = await $`which bun`.quiet().text();
    const path = which.trim();
    return path && existsSync(path) ? path : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const systemBun = await resolveSystemBun();
  if (!systemBun) {
    console.error(
      '[prepare:runtime] No `bun` on PATH. Install Bun: curl -fsSL https://bun.sh/install | bash',
    );
    process.exit(1);
  }

  copyFileSync(systemBun, BUN_OUT);
  chmodSync(BUN_OUT, 0o755);

  let version = 'unknown';
  try {
    version = readFileSync(join(systemBun, '..', '..', 'package.json'), 'utf8');
  } catch {
    /* ignore */
  }
  try {
    const proc = Bun.spawn([BUN_OUT, '--version'], { stdout: 'pipe' });
    version = (await new Response(proc.stdout).text()).trim();
    await proc.exited;
  } catch {
    /* ignore */
  }

  console.log(`[prepare:runtime] Copied ${systemBun} → ${BUN_OUT} (bun ${version})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
