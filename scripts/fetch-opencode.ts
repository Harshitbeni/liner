#!/usr/bin/env bun
/**
 * Download OpenCode CLI binary for Electron packaging.
 *
 *   bun run build:engine
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..');
const OUT_DIR = join(REPO_ROOT, 'apps', 'liner-electron', 'build', 'opencode');
const VERSION = process.env.OPENCODE_VERSION ?? '1.15.7';

function fail(msg: string): never {
  console.error(`\n[build:engine] ${msg}`);
  process.exit(1);
}

function assetName(): string {
  if (process.platform === 'darwin') {
    return process.arch === 'arm64'
      ? 'opencode-darwin-arm64.zip'
      : 'opencode-darwin-x64.zip';
  }
  if (process.platform === 'linux') {
    return process.arch === 'arm64'
      ? 'opencode-linux-arm64.tar.gz'
      : 'opencode-linux-x64.tar.gz';
  }
  if (process.platform === 'win32') {
    return 'opencode-windows-x64.zip';
  }
  fail(`Unsupported platform: ${process.platform}`);
}

async function main(): Promise<void> {
  const name = assetName();
  const url = `https://github.com/anomalyco/opencode/releases/download/v${VERSION}/${name}`;
  console.log(`[build:engine] Downloading OpenCode v${VERSION} (${name})…`);

  mkdirSync(OUT_DIR, { recursive: true });
  const archivePath = join(OUT_DIR, name);
  const res = await fetch(url);
  if (!res.ok) fail(`Download failed: ${res.status} ${url}`);
  await Bun.write(archivePath, res);

  const extract =
    name.endsWith('.zip')
      ? ['unzip', '-o', archivePath, '-d', OUT_DIR]
      : ['tar', '-xf', archivePath, '-C', OUT_DIR];
  const proc = Bun.spawn(extract, {
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const code = await proc.exited;
  if (code !== 0) fail('Failed to extract archive');

  const binName = process.platform === 'win32' ? 'opencode.exe' : 'opencode';
  const extracted = join(OUT_DIR, binName);
  if (!existsSync(extracted)) {
    fail(`Expected binary at ${extracted} after extract`);
  }

  const staged = join(OUT_DIR, 'bin', 'opencode');
  mkdirSync(join(OUT_DIR, 'bin'), { recursive: true });
  const data = readFileSync(extracted);
  writeFileSync(staged, data);
  if (process.platform !== 'win32') {
    chmodSync(staged, 0o755);
  }

  const manifest = {
    engine: 'opencode',
    version: VERSION,
    platform: process.platform,
    arch: process.arch,
    builtAt: new Date().toISOString(),
  };
  writeFileSync(
    join(OUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  console.log(`[build:engine] Staged → ${staged}`);
}

main().catch((e) => fail(String(e)));
