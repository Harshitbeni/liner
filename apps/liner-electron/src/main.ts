import { app, BrowserWindow, shell } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { resolveBunExecutable, resolveRepoRoot } from './engine-paths';

const isPackaged = app.isPackaged;
/** Bundled main/preload live in dist/ inside app.asar when packaged. */
const ELECTRON_DIST = __dirname;
const REPO_ROOT = isPackaged
  ? process.resourcesPath
  : resolveRepoRoot(ELECTRON_DIST);
const LINER_SERVER = join(REPO_ROOT, 'apps', 'liner-server', 'src', 'index.ts');
const PACKAGED_API = join(process.resourcesPath, 'liner-server', 'index.js');
const PACKAGED_UI = join(process.resourcesPath, 'liner-ui', 'index.html');
const UI_DIST = join(REPO_ROOT, 'apps', 'liner', 'dist', 'index.html');
const LINER_UI = join(REPO_ROOT, 'apps', 'liner');

let linerApiProcess: ChildProcess | null = null;
let uiStaticProcess: ChildProcess | null = null;
let viteProcess: ChildProcess | null = null;

let bunPath: string | null = null;
let bunSource: 'bundled' | 'system' | 'none' = 'none';
let resolvedApiPort = Number(process.env.LINER_API_PORT ?? 9240);

const LINER_API_PORT = process.env.LINER_API_PORT ?? '9240';
const UI_DEV_PORT = process.env.LINER_UI_PORT ?? '5180';
const PACKAGED_UI_PORT = process.env.LINER_UI_STATIC_PORT ?? '5181';
const UI_DEV_URL = process.env.LINER_UI_URL ?? `http://127.0.0.1:${UI_DEV_PORT}`;

function apiBaseUrl(port = resolvedApiPort): string {
  return `http://127.0.0.1:${port}/api`;
}

function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Port ${port} not ready`));
        } else {
          setTimeout(tryOnce, 300);
        }
      });
    };
    tryOnce();
  });
}

function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

/** When 9240 is taken (e.g. dev server), use another port so .app gets its own API. */
async function resolveApiPortForSpawn(): Promise<number> {
  const preferred = Number(LINER_API_PORT);
  if (!isPackaged) return preferred;
  if (!(await isPortListening(preferred))) return preferred;
  for (const alt of [preferred + 1, preferred + 2, 9242, 9243, 9244]) {
    if (!(await isPortListening(alt))) {
      console.warn(
        `[liner] Port ${preferred} is in use (dev server?). Packaged API will use ${alt}.`,
      );
      return alt;
    }
  }
  console.warn(`[liner] No free API port near ${preferred}; trying ${preferred} anyway.`);
  return preferred;
}

function apiEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    LINER_PACKAGED: isPackaged ? '1' : '0',
    LINER_MANAGED_ENGINE: '0',
    LINER_RPC_MODE: process.env.LINER_RPC_MODE ?? 'cursor-sdk',
    LINER_REPO_ROOT: REPO_ROOT,
    LINER_RESOURCES_PATH: process.resourcesPath,
    LINER_BUN_PATH: bunPath ?? '',
    LINER_BUN_SOURCE: bunSource,
    LINER_API_PORT: String(resolvedApiPort),
  };
}

function resolveApiBun(): string | null {
  const { path, source } = resolveBunExecutable({
    isPackaged,
    resourcesPath: process.resourcesPath,
  });
  bunPath = path;
  bunSource = source;
  return path;
}

function spawnLinerApi(): void {
  const bun = resolveApiBun();
  if (!bun) {
    const msg =
      'Bun runtime not found. Install: curl -fsSL https://bun.sh/install | bash — or rebuild with `bun run prepare:runtime`.';
    console.error('[liner]', msg);
    return;
  }

  const serverScript = isPackaged ? PACKAGED_API : LINER_SERVER;
  const apiCwd = isPackaged
    ? join(process.resourcesPath, 'liner-server')
    : join(REPO_ROOT, 'apps', 'liner-server');

  linerApiProcess = spawn(bun, [serverScript], {
    cwd: apiCwd,
    env: apiEnv(),
    stdio: isPackaged ? 'pipe' : 'inherit',
  });

  linerApiProcess.on('exit', (code) => {
    console.log('[liner] API server exited', code);
    linerApiProcess = null;
  });

  linerApiProcess.stderr?.on('data', (chunk) => {
    const line = String(chunk).trim();
    if (line) console.warn('[liner] api stderr:', line);
  });

  linerApiProcess.stdout?.on('data', (chunk) => {
    const line = String(chunk).trim();
    if (line) console.log('[liner] api stdout:', line);
  });
}

/** Serve packaged UI over http:// (file:// breaks some fetch paths in Electron). */
function spawnPackagedUiServer(): void {
  if (!isPackaged) return;
  const bun = bunPath;
  if (!bun) return;

  const uiRoot = join(process.resourcesPath, 'liner-ui');
  const port = Number(PACKAGED_UI_PORT);
  const script = `
import { join } from 'node:path';
const root = ${JSON.stringify(uiRoot)};
const port = ${port};
Bun.serve({
  port,
  hostname: '127.0.0.1',
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const file = Bun.file(join(root, pathname));
    if (await file.exists()) return new Response(file);
    return new Response(Bun.file(join(root, 'index.html')));
  },
});
console.log('[liner-ui] http://127.0.0.1:' + port);
`;

  uiStaticProcess = spawn(bun, ['-e', script], {
    stdio: isPackaged ? 'pipe' : 'inherit',
    env: process.env,
  });

  uiStaticProcess.stderr?.on('data', (chunk) => {
    const line = String(chunk).trim();
    if (line) console.warn('[liner] ui stderr:', line);
  });
}

function spawnViteDev(): void {
  if (isPackaged) return;
  if (existsSync(UI_DIST) && process.env.LINER_DEV === '0') return;
  const bun = bunPath ?? 'bun';
  viteProcess = spawn(bun, ['run', 'dev'], {
    cwd: LINER_UI,
    env: {
      ...process.env,
      VITE_LINER_API: apiBaseUrl(resolvedApiPort),
    },
    stdio: 'inherit',
  });
  viteProcess.on('exit', (code) => {
    console.log('[liner] Vite dev server exited', code);
    viteProcess = null;
  });
}

function createWindow(): void {
  const apiArg = `--liner-api-base=${encodeURIComponent(apiBaseUrl())}`;

  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: 'Liner',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: join(ELECTRON_DIST, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [apiArg],
    },
  });

  const loadPackagedOrDist = (): void => {
    if (isPackaged && existsSync(PACKAGED_UI)) {
      void win.loadURL(`http://127.0.0.1:${PACKAGED_UI_PORT}/`);
      return;
    }
    if (existsSync(UI_DIST) && process.env.LINER_DEV === '0') {
      void win.loadFile(UI_DIST);
      return;
    }
    void win.loadURL(UI_DEV_URL).catch(() => {
      void win.loadURL(
        `data:text/html,<body style="font-family:system-ui;background:#111;color:#eee;padding:2rem"><h1>Liner</h1><p>Waiting for UI at ${UI_DEV_URL}</p></body>`,
      );
    });
  };

  loadPackagedOrDist();

  win.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    shell.openExternal(openUrl);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  resolveApiBun();
  resolvedApiPort = await resolveApiPortForSpawn();
  spawnLinerApi();
  spawnPackagedUiServer();
  spawnViteDev();

  try {
    await waitForPort(resolvedApiPort, 60_000);
    if (isPackaged) {
      await waitForPort(Number(PACKAGED_UI_PORT), 30_000);
    } else if (!existsSync(UI_DIST) || process.env.LINER_DEV !== '0') {
      await waitForPort(Number(UI_DEV_PORT));
    }
  } catch (e) {
    console.warn('[liner] startup wait:', e);
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  linerApiProcess?.kill();
  uiStaticProcess?.kill();
  viteProcess?.kill();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
