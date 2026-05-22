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
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { $ } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..');
const ELECTRON_RELEASE = join(REPO_ROOT, 'apps', 'liner-electron', 'release');
const USE_SUDO =
  process.env.LINER_INSTALL_SUDO === '1' ||
  (process.env.LINER_INSTALL_SUDO !== '0' && process.getuid?.() !== 0);

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

function findLinuxExecInDir(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const known = ['liner', 'liner-electron', '@linerelectron', 'Liner'];
  for (const name of known) {
    const path = join(dir, name);
    try {
      if (existsSync(path) && (statSync(path).mode & 0o111) !== 0) return path;
    } catch {
      /* ignore */
    }
  }
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name.endsWith('.so') || name.endsWith('.pak') || name.includes('.')) continue;
    try {
      if ((statSync(path).mode & 0o111) !== 0) return path;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function findLinuxUnpacked(): { dir: string; exec: string } {
  const candidates = [
    join(ELECTRON_RELEASE, 'linux-unpacked'),
    join(ELECTRON_RELEASE, `linux${process.arch === 'arm64' ? '-arm64' : ''}-unpacked`),
  ];
  for (const dir of candidates) {
    const exec = findLinuxExecInDir(dir);
    if (exec) return { dir, exec };
  }
  if (!existsSync(ELECTRON_RELEASE)) {
    fail(`Release dir missing: ${ELECTRON_RELEASE}. Run \`bun run build:desktop:bundled\` first.`);
  }
  for (const name of readdirSync(ELECTRON_RELEASE)) {
    if (!name.includes('unpacked')) continue;
    const dir = join(ELECTRON_RELEASE, name);
    const exec = findLinuxExecInDir(dir);
    if (exec) return { dir, exec };
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

async function installMac(source: string): Promise<void> {
  const dest = process.env.LINER_INSTALL_DIR ?? '/Applications/Liner.app';
  console.log(`[install:desktop] Installing ${source} → ${dest}`);
  if (USE_SUDO && process.getuid?.() !== 0) {
    awaitRemoveAndCopySudo(source, dest);
  } else {
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    cpSync(source, dest, { recursive: true });
  }
  console.log(`[install:desktop] Installed Liner.app to ${dest}`);
}

async function awaitRemoveAndCopySudo(source: string, dest: string): Promise<void> {
  if (existsSync(dest)) {
    await $`sudo rm -rf ${dest}`.quiet();
  }
  const parent = dest.replace(/\/[^/]+$/, '');
  await $`sudo mkdir -p ${parent}`.quiet();
  await $`sudo cp -R ${source} ${dest}`.quiet();
  await $`sudo chmod -R a+rX ${dest}`.quiet();
}

async function installLinux(sourceDir: string, sourceExec: string): Promise<void> {
  const optDest = process.env.LINER_INSTALL_DIR ?? '/opt/Liner';
  const desktopDir =
    process.env.LINER_DESKTOP_DIR ?? '/usr/local/share/applications';
  const desktopFile = join(desktopDir, 'liner.desktop');
  const execName = sourceExec.split('/').pop() ?? 'liner';
  const installedExec = join(optDest, execName);

  console.log(`[install:desktop] Installing ${sourceDir} → ${optDest}`);

  const desktop = `[Desktop Entry]
Name=Liner
Comment=Liner desktop app
Exec=${installedExec} %U
Terminal=false
Type=Application
Categories=Office;Productivity;
StartupWMClass=liner
`;

  try {
    if (existsSync(optDest)) rmSync(optDest, { recursive: true, force: true });
    mkdirSync(dirname(optDest), { recursive: true });
    cpSync(sourceDir, optDest, { recursive: true });
    chmodSync(installedExec, 0o755);
    mkdirSync(desktopDir, { recursive: true });
    writeFileSync(desktopFile, desktop, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EACCES' || !USE_SUDO) throw e;
    console.log('[install:desktop] Retrying install with sudo…');
    await $`sudo rm -rf ${optDest}`.quiet();
    await $`sudo mkdir -p ${optDest}`.quiet();
    await $`sudo cp -R ${sourceDir}/. ${optDest}/`.quiet();
    await $`sudo chmod -R a+rX ${optDest}`.quiet();
    await $`sudo mkdir -p ${desktopDir}`.quiet();
    const tmpDesktop = join(REPO_ROOT, '.liner-desktop-entry.tmp');
    writeFileSync(tmpDesktop, desktop, 'utf8');
    await $`sudo cp ${tmpDesktop} ${desktopFile}`.quiet();
    rmSync(tmpDesktop, { force: true });
  }

  if (!existsSync(installedExec)) {
    fail(`Expected executable at ${installedExec}`);
  }
  console.log(`[install:desktop] Installed to ${optDest} and ${desktopFile}`);
}

async function main(): Promise<void> {
  await buildIfNeeded();

  if (process.platform === 'darwin') {
    await installMac(findMacApp());
    return;
  }

  if (process.platform === 'linux') {
    const { dir, exec } = findLinuxUnpacked();
    await installLinux(dir, exec);
    return;
  }

  fail(`Unsupported platform: ${process.platform}. Use macOS or Linux.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
