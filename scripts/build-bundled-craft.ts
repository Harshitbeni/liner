#!/usr/bin/env bun
/**
 * Build Craft server distribution and stage it for Electron packaging.
 *
 *   bun run build:engine
 */
import { existsSync, mkdirSync, readFileSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..');
const VENDOR = join(REPO_ROOT, 'vendor', 'craft-agents-oss');
const OUT_DIR = join(REPO_ROOT, 'apps', 'liner-electron', 'build', 'craft-engine');
const CRAFT_DIST = join(VENDOR, 'dist', 'server');

function fail(msg: string): never {
  console.error(`\n[build:engine] ${msg}`);
  console.error('\nSee docs/ENGINE.md for prerequisites.');
  process.exit(1);
}

function detectTarget(): { platform: 'darwin'; arch: 'arm64' | 'x64'; script: string } {
  if (process.platform !== 'darwin') {
    fail(`Unsupported host platform "${process.platform}". V1 targets macOS only.`);
  }
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const script =
    arch === 'arm64' ? 'server:build:darwin-arm64' : 'server:build:darwin-x64';
  return { platform: 'darwin', arch, script };
}

function readCraftVersion(): string {
  const pkgPath = join(VENDOR, 'package.json');
  if (!existsSync(pkgPath)) fail('vendor/craft-agents-oss/package.json not found.');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
  return pkg.version ?? 'unknown';
}

async function main(): Promise<void> {
  if (!existsSync(join(VENDOR, 'package.json'))) {
    fail(
      'Git submodule vendor/craft-agents-oss is missing. Run: git submodule update --init vendor/craft-agents-oss',
    );
  }

  const nodeModules = join(VENDOR, 'node_modules');
  if (!existsSync(nodeModules)) {
    fail(
      'Craft dependencies not installed. Run: cd vendor/craft-agents-oss && bun install',
    );
  }

  const { platform, arch, script } = detectTarget();
  const version = readCraftVersion();

  console.log(`[build:engine] Building Craft ${version} (${platform}-${arch})…`);
  console.log(`[build:engine] Running: bun run ${script}`);

  const build = Bun.spawn(['bun', 'run', script], {
    cwd: VENDOR,
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env },
  });
  const code = await build.exited;
  if (code !== 0) {
    fail(`Craft build exited with code ${code}. Check vendor/craft-agents-oss build logs.`);
  }

  if (!existsSync(join(CRAFT_DIST, 'bin', 'craft-server'))) {
    fail(
      `Expected build output at vendor/craft-agents-oss/dist/server/bin/craft-server — not found.`,
    );
  }

  console.log(`[build:engine] Staging → ${OUT_DIR}`);
  if (existsSync(OUT_DIR)) {
    rmSync(OUT_DIR, { recursive: true, force: true });
  }
  mkdirSync(join(REPO_ROOT, 'apps', 'liner-electron', 'build'), { recursive: true });
  cpSync(CRAFT_DIST, OUT_DIR, { recursive: true });

  console.log('[build:engine] Installing staged runtime dependencies…');
  const install = Bun.spawn(['bun', 'install'], {
    cwd: OUT_DIR,
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env },
  });
  if ((await install.exited) !== 0) {
    fail('bun install failed in staged craft-engine (missing deps like fast-uri).');
  }

  const manifest = {
    engine: 'craft-agents-oss',
    version,
    platform,
    arch,
    builtAt: new Date().toISOString(),
    craftBuildScript: script,
  };
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log('[build:engine] Done.');
  console.log(`  manifest: ${join(OUT_DIR, 'manifest.json')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
