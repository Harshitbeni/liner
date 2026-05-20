import { app, BrowserWindow, shell } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import {
  readEngineManifest,
  resolveBunExecutable,
  resolveCraftEngineRoot,
  resolveCraftServerEntry,
  resolveRepoRoot,
  type EngineState,
} from './engine-paths';

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

let craftProcess: ChildProcess | null = null;
let linerApiProcess: ChildProcess | null = null;
let viteProcess: ChildProcess | null = null;

let engineState: EngineState = 'starting';
let engineError: string | null = null;
let engineVersion: string | null = null;
let enginePlatform: string | undefined;
let engineArch: string | undefined;
let engineSource: 'bundled' | 'dev' | 'none' = 'none';
let bunPath: string | null = null;
let bunSource: 'bundled' | 'system' | 'none' = 'none';

const CRAFT_RPC_PORT = process.env.CRAFT_RPC_PORT ?? '9100';
const LINER_API_PORT = process.env.LINER_API_PORT ?? '9240';
const UI_DEV_PORT = process.env.LINER_UI_PORT ?? '5180';
const UI_DEV_URL = process.env.LINER_UI_URL ?? `http://127.0.0.1:${UI_DEV_PORT}`;

function setEngineState(state: EngineState, error?: string | null): void {
  engineState = state;
  if (error !== undefined) engineError = error;
}

function engineEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    LINER_PACKAGED: isPackaged ? '1' : '0',
    LINER_ENGINE_STATE: engineState,
    LINER_ENGINE_NAME: 'craft-agents-oss',
    LINER_ENGINE_VERSION: engineVersion ?? '',
    LINER_ENGINE_ERROR: engineError ?? '',
    LINER_ENGINE_SOURCE: engineSource,
    LINER_ENGINE_PLATFORM: enginePlatform ?? '',
    LINER_ENGINE_ARCH: engineArch ?? '',
    LINER_BUN_PATH: bunPath ?? '',
    LINER_BUN_SOURCE: bunSource,
    LINER_RPC_MODE:
      process.env.LINER_RPC_MODE ?? (isPackaged ? 'craft' : 'auto'),
    CRAFT_RPC_PORT,
    LINER_API_PORT,
  };
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

function spawnCraftServer(): void {
  const { root: engineRoot, source } = resolveCraftEngineRoot(
    isPackaged,
    process.resourcesPath,
    REPO_ROOT,
  );
  engineSource = source;

  const manifest = readEngineManifest(engineRoot);
  if (manifest) {
    engineVersion = manifest.version;
    enginePlatform = manifest.platform;
    engineArch = manifest.arch;
  } else if (!isPackaged && existsSync(join(engineRoot, 'package.json'))) {
    try {
      const pkg = JSON.parse(
        readFileSync(join(engineRoot, 'package.json'), 'utf8'),
      ) as { version?: string };
      engineVersion = pkg.version ?? null;
    } catch {
      engineVersion = null;
    }
  }

  const entry = resolveCraftServerEntry(isPackaged, engineRoot);
  if (!entry) {
    const msg = isPackaged
      ? 'Bundled AI engine not found in app resources. Rebuild with `bun run build:desktop:bundled`.'
      : 'craft-agents-oss submodule missing — install vendor or use mock RPC.';
    console.warn('[liner]', msg);
    setEngineState(isPackaged ? 'failed' : 'unavailable', msg);
    return;
  }

  setEngineState('starting');

  const spawnEnv = {
    ...process.env,
    CRAFT_RPC_HOST: '127.0.0.1',
    CRAFT_RPC_PORT,
    CRAFT_DEBUG: 'true',
    CRAFT_BUNDLED_ASSETS_ROOT: engineRoot,
    CRAFT_IS_PACKAGED: isPackaged ? 'true' : 'false',
    CRAFT_APP_ROOT: engineRoot,
    CRAFT_RESOURCES_PATH: join(engineRoot, 'resources'),
  };

  let child: ChildProcess;

  if (isPackaged || entry.endsWith('craft-server')) {
    child = spawn(entry, [], {
      cwd: engineRoot,
      env: spawnEnv,
      stdio: isPackaged ? 'pipe' : 'inherit',
    });
  } else {
    const bun = bunPath ?? 'bun';
    child = spawn(bun, ['run', entry], {
      cwd: engineRoot,
      env: spawnEnv,
      stdio: isPackaged ? 'pipe' : 'inherit',
    });
  }

  craftProcess = child;

  child.on('spawn', () => {
    console.log('[liner] AI engine starting', { entry, engineRoot });
  });

  child.on('exit', (code) => {
    console.log('[liner] AI engine exited', code);
    craftProcess = null;
    if (engineState === 'starting' || engineState === 'ready') {
      setEngineState('failed', `AI engine exited (code ${code ?? 'unknown'})`);
    }
  });

  child.stderr?.on('data', (chunk) => {
    const line = String(chunk).trim();
    if (line) console.warn('[liner] craft stderr:', line);
  });

  void waitForPort(Number(CRAFT_RPC_PORT), 45_000)
    .then(() => {
      if (craftProcess) setEngineState('ready', null);
    })
    .catch((e) => {
      setEngineState(
        'failed',
        e instanceof Error ? e.message : 'AI engine port not ready',
      );
    });
}

function resolveApiBun(): string | null {
  const { path, source } = resolveBunExecutable(isPackaged, process.resourcesPath);
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
    setEngineState(engineState === 'starting' ? 'failed' : engineState, msg);
    return;
  }

  const serverScript = isPackaged ? PACKAGED_API : LINER_SERVER;
  const apiCwd = isPackaged
    ? join(process.resourcesPath, 'liner-server')
    : join(REPO_ROOT, 'apps', 'liner-server');

  linerApiProcess = spawn(bun, [serverScript], {
    cwd: apiCwd,
    env: engineEnv(),
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
}

function spawnViteDev(): void {
  if (isPackaged) return;
  if (existsSync(UI_DIST) && process.env.LINER_DEV === '0') return;
  const bun = bunPath ?? 'bun';
  viteProcess = spawn(bun, ['run', 'dev'], {
    cwd: LINER_UI,
    env: {
      ...process.env,
      VITE_LINER_API: `http://127.0.0.1:${LINER_API_PORT}/api`,
    },
    stdio: 'inherit',
  });
  viteProcess.on('exit', (code) => {
    console.log('[liner] Vite dev server exited', code);
    viteProcess = null;
  });
}

function createWindow(): void {
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
    },
  });

  const loadPackagedOrDist = (): void => {
    if (isPackaged && existsSync(PACKAGED_UI)) {
      void win.loadFile(PACKAGED_UI);
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
  spawnCraftServer();
  spawnLinerApi();
  spawnViteDev();

  try {
    await waitForPort(Number(LINER_API_PORT));
    if (!isPackaged && (!existsSync(UI_DIST) || process.env.LINER_DEV !== '0')) {
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
  craftProcess?.kill();
  linerApiProcess?.kill();
  viteProcess?.kill();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
