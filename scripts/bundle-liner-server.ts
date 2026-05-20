#!/usr/bin/env bun
/**
 * Bundle Liner API into a single file for Electron packaging.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..');
const entry = join(REPO_ROOT, 'apps', 'liner-server', 'src', 'index.ts');
const outdir = join(REPO_ROOT, 'apps', 'liner-electron', 'build', 'liner-server');

async function main(): Promise<void> {
  mkdirSync(outdir, { recursive: true });

  const result = await Bun.build({
    entrypoints: [entry],
    outdir,
    target: 'bun',
    format: 'esm',
    sourcemap: 'linked',
    packages: 'bundle',
  });

  if (!result.success) {
    console.error('[bundle:api] failed');
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }

  const out = join(outdir, 'index.js');
  if (!existsSync(out)) {
    console.error('[bundle:api] expected', out);
    process.exit(1);
  }
  console.log('[bundle:api] wrote', out);
}

await main();
