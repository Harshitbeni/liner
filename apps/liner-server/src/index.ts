import {
  createLinerRuntime,
  OutlineStore,
  resolvePreferredRpcMode,
  isValidWorkspaceId,
} from '@liner/core';
import {
  broadcastAgentStatus,
  broadcastStateChange,
  configurePointActivity,
  ensureSessionBridge,
} from './sse';
import { handleApiRequest, type LinerRuntime } from './router';

const PORT = Number(process.env.LINER_API_PORT ?? 9240);
let runtime: LinerRuntime | null = null;
let runtimeInit: Promise<LinerRuntime> | null = null;
let activeWorkspaceId =
  process.env.LINER_WORKSPACE_ID ?? 'default';

let harnessAgentBridgeInstalled = false;

function installHarnessBridge(rt: LinerRuntime): void {
  if (harnessAgentBridgeInstalled) return;
  rt.harness.onAgentRun((pointId, running) => {
    broadcastAgentStatus(pointId, running);
  });
  rt.harness.onStateChange((pointId, from, to, actor) => {
    broadcastStateChange(pointId, from, to, actor);
  });
  harnessAgentBridgeInstalled = true;
}

async function initRuntime(workspaceId?: string): Promise<LinerRuntime> {
  const id = workspaceId ?? activeWorkspaceId;
  activeWorkspaceId = id;
  const preferred = resolvePreferredRpcMode();
  if (runtime) {
    await runtime.rpc.disconnect();
  }
  runtime = await createLinerRuntime(id, preferred);
  installHarnessBridge(runtime);
  configurePointActivity((pointId) => {
    runtime?.store.touchPoint(pointId);
  });
  return runtime;
}

async function getRuntime(): Promise<LinerRuntime> {
  if (runtime) return runtime;
  if (!runtimeInit) {
    runtimeInit = initRuntime(activeWorkspaceId).finally(() => {
      runtimeInit = null;
    });
  }
  return runtimeInit;
}

function getStore(): OutlineStore {
  if (runtime) return runtime.store;
  return new OutlineStore(activeWorkspaceId);
}

async function switchWorkspace(workspaceId: string) {
  if (!isValidWorkspaceId(workspaceId)) {
    throw new Error('Invalid workspace id');
  }
  harnessAgentBridgeInstalled = false;
  runtimeInit = initRuntime(workspaceId).finally(() => {
    runtimeInit = null;
  });
  return runtimeInit;
}

async function bridgePointSession(pointId: string): Promise<void> {
  const { store, rpc, harness } = await getRuntime();
  const point = store.getPoint(pointId);
  if (!point) return;
  const sessionId = await harness.ensurePointSession(pointId);
  ensureSessionBridge(pointId, sessionId, (sid, onMsg) =>
    rpc.subscribe(sid, onMsg),
  );
}

const routerDeps = {
  getActiveWorkspaceId: () => activeWorkspaceId,
  hasRuntime: () => runtime !== null,
  getStore,
  getRuntime,
  initRuntime,
  switchWorkspace,
  resetHarnessBridge: () => {
    harnessAgentBridgeInstalled = false;
  },
  bridgePointSession,
};

let server: ReturnType<typeof Bun.serve>;
try {
  server = Bun.serve({
    port: PORT,
    hostname: '127.0.0.1',
    async fetch(req) {
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }

      const url = new URL(req.url);
      try {
        return await handleApiRequest(routerDeps, req, url);
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    },
  });
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Stop the other process or run: bun run predev`,
    );
    process.exit(1);
  }
  throw e;
}

console.log(`Liner API http://127.0.0.1:${server.port}`);
