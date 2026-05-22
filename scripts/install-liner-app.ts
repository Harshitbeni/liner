#!/usr/bin/env bun
/**
 * Build and install Liner to the system applications folder.
 *
 *   bun run install:desktop
 *   SKIP_BUILD=1 bun run install:desktop   # install existing release artifact only
 *
 * macOS:  /Applications/Liner.app
 * Linux:  /opt/Liner (unpacked dir) + .desktop in /usr/local/share/applications
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  cpSync,
  chmodSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..');
const ELECTRON_RELEASE = join(REPO_ROOT, 'apps', 'liner-electron', 'release');

function fail(msg: string): never {
  console.error(`[install:desktop] ${msg}`);
  process.exit(1);
}

function macArchDir(): string {
  if (process.arch === 'arm64') return 'mac-arm64';
  if (process.arch === 'x64') return 'mac';
  fail(`Unsupported macOS arch: ${process.arch}`);
}

function findMacApp(): string {
  const candidates = [
    join(ELECTRON_RELEASE, macArchDir(), 'Liner.app'),
    join(ELECTRON_RELEASE, 'mac-arm64', 'Liner.app'),
    join(ELECTRON_RELEASE, 'mac', 'Liner.app'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  fail(
    `Liner.app not found under ${ELECTRON_RELEASE}. Run \`bun run build:desktop:bundled\` first.`,
  );
}

function findLinuxUnpacked(): string {
  const candidates = [
    join(ELECTRON_RELEASE, 'linux-unpacked'),
    join(ELECTRON_RELEASE, `linux${process.arch === 'arm64' ? '-arm64' : ''}-unpacked`),
  ];
  for (const p of candidates) {
    if (existsSync(join(p, 'liner'))) return p;
    if (existsSync(join(p, 'liner-electron'))) return p;
  }
  const releaseDir = ELECTRON_RELEASE;
  if (!existsSync(releaseDir)) {
    fail(`Release dir missing: ${releaseDir}. Run \`bun run build:desktop:bundled\` first.`);
  }
  for (const name of readdirSync(releaseDir)) {
    const dir = join(releaseDir, name);
    if (name.includes('unpacked') && existsSync(join(dir, 'liner'))) return dir;
  }
  fail(
    `Linux unpacked app not found under ${ELECTRON_RELEASE}. Run \`bun run build:desktop:bundled\` first.`,
  );
}

async function buildIfNeeded(): Promise<void> {
  if (process.env.SKIP_BUILD === '1') {
    console.log('[install:desktop] SKIP_BUILD=1 — using existing release artifacts');
    return;
  }
  console.log('[install:desktop] Building bundled desktop app…');
  await $`bun run build:desktop:bundled`.cwd(REPO_ROOT);
}

function installMac(source: string): void {
  const dest = '/Applications/Liner.app';
  console.log(`[install:desktop] Installing ${source} → ${dest}`);
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  cpSync(source, dest, { recursive: true });
  console.log(`[install:desktop] Installed Liner.app to ${dest}`);
}

function installLinux(source: string): void {
  const optDest = '/opt/Liner';
  const desktopDir = '/usr/local/share/applications';
  const desktopFile = join(desktopDir, 'liner.desktop');

  console.log(`[install:desktop] Installing ${source} → ${optDest}`);
  if (existsSync(optDest)) {
    rmSync(optDest, { recursive: true, force: true });
  }
  mkdirSync('/opt', { recursive: true });
  cpSync(source, optDest, { recursive: true });

  const exec = join(optDest, 'liner');
  if (!existsSync(exec)) {
    fail(`Expected executable at ${exec}`);
  }
  chmodSync(exec, 0o755);

  mkdirSync(desktopDir, { recursive: true });
  const desktop = `[Desktop Entry]
Name=Liner
Comment=Liner desktop app
Exec=${exec} %U
Terminal=false
Type=Application
Categories=Office;Productivity;
StartupWMClass=liner
`;
  writeFileSync(desktopFile, desktop, 'utf8');
  console.log(`[install:desktop] Installed to ${optDest} and ${desktopFile}`);
}

async function main(): Promise<void> {
  await buildIfNeeded();

  if (process.platform === 'darwin') {
    installMac(findMacApp());
    return;
  }

  if (process.platform === 'linux') {
    installLinux(findLinuxUnpacked());
    return;
  }

  fail(`Unsupported platform: ${process.platform}. Use macOS or Linux.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
