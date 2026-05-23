import {
  createLinerRuntime,
  createWorkspace,
  CursorSdkSessionRpcAdapter,
  CURSOR_DEFAULT_MODEL,
  OutlineStore,
  getEngineInfo,
  hasCursorApiKey,
  isMockFallbackAllowed,
  isPackagedMode,
  listWorkspaces,
  isValidWorkspaceId,
  readLinerAuth,
  setCursorApiKey,
  workspaceDir,
  listSubagents,
  listSkills,
  verifyEngineConnection,
} from '@liner/core';
import type { AgentIntent, PointState, PointPriority } from '@liner/core';
import { resolveMentions, prependQuote } from '@liner/core';
import {
  broadcastAgentStatus,
  broadcastPointMessage,
  broadcastPointPing,
  broadcastStateChange,
  configurePointActivity,
  ensureSessionBridge,
  subscribePointSse,
} from './sse';

const PORT = Number(process.env.LINER_API_PORT ?? 9240);
let runtime: Awaited<ReturnType<typeof createLinerRuntime>> | null = null;
let runtimeInit: Promise<NonNullable<typeof runtime>> | null = null;
let activeWorkspaceId =
  process.env.LINER_WORKSPACE_ID ?? 'default';

let harnessAgentBridgeInstalled = false;

function installHarnessBridge(
  rt: NonNullable<typeof runtime>,
): void {
  if (harnessAgentBridgeInstalled) return;
  rt.harness.onAgentRun((pointId, running) => {
    broadcastAgentStatus(pointId, running);
  });
  rt.harness.onStateChange((pointId, from, to, actor) => {
    broadcastStateChange(pointId, from, to, actor);
  });
  harnessAgentBridgeInstalled = true;
}

function preferredRpcMode(): 'mock' | 'cursor-sdk' | undefined {
  const env = process.env.LINER_RPC_MODE as 'mock' | 'cursor-sdk' | undefined;
  if (env === 'cursor-sdk') return 'cursor-sdk';
  if (hasCursorApiKey()) return 'cursor-sdk';
  if (env === 'mock') return 'mock';
  return undefined;
}

async function initRuntime(workspaceId?: string): Promise<NonNullable<typeof runtime>> {
  const id = workspaceId ?? activeWorkspaceId;
  activeWorkspaceId = id;
  const preferred = preferredRpcMode();
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

async function getRuntime() {
  if (runtime) return runtime;
  if (!runtimeInit) {
    runtimeInit = initRuntime(activeWorkspaceId).finally(() => {
      runtimeInit = null;
    });
  }
  return runtimeInit;
}

/** DB-only store for settings routes — no RPC connect required. */
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

async function buildHealthLight(): Promise<{
  ok: boolean;
  rpc: string;
  connected: boolean;
  engineReachable: boolean;
  lastError: string | null;
  workspaceId: string;
  engine: ReturnType<typeof getEngineInfo>;
}> {
  const engine = getEngineInfo();
  const hasKey = hasCursorApiKey();
  const rpcMode = hasKey ? 'cursor-sdk' : (process.env.LINER_RPC_MODE ?? 'mock');
  const lastError: string | null = hasKey
    ? engine.error
    : (engine.error ?? 'Cursor API key not configured');

  return {
    ok: true,
    rpc: rpcMode,
    connected: false,
    engineReachable: hasKey,
    lastError,
    workspaceId: activeWorkspaceId,
    engine,
  };
}

async function buildHealth(rt: Awaited<ReturnType<typeof getRuntime>>) {
  const { store, rpc } = rt;
  const connected = rpc.isConnected();
  const engine = getEngineInfo();
  let engineReachable = hasCursorApiKey();
  let lastError: string | null = null;

  if (rpc.mode === 'mock') {
    engineReachable = false;
    lastError = isPackagedMode()
      ? 'Cursor SDK unavailable — using demo mode. Check Settings → Cursor SDK.'
      : 'Using mock RPC — add Cursor API key for Composer 2.5';
    if (isMockFallbackAllowed()) {
      engine.state = 'mock-fallback';
    }
  } else if (rpc instanceof CursorSdkSessionRpcAdapter) {
    engineReachable = rpc.isSdkNative();
    lastError = rpc.getLastError();
    if (rpc.isSdkNative()) {
      engine.state = 'ready';
    } else {
      const err = lastError ?? engine.error ?? 'Cursor SDK unavailable';
      lastError = err;
      if (isMockFallbackAllowed()) {
        engine.state = 'mock-fallback';
        lastError = lastError ?? 'Connected via demo fallback';
      } else {
        engine.state = 'failed';
      }
    }
  }

  if (!hasCursorApiKey()) {
    lastError = lastError ?? 'Cursor API key not configured';
    engineReachable = false;
  }

  return {
    ok: true,
    rpc: rpc.mode,
    connected,
    engineReachable,
    lastError,
    workspaceId: store.workspaceId,
    engine,
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
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

let server: ReturnType<typeof Bun.serve>;
try {
  server = Bun.serve({
    port: PORT,
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
      const path = url.pathname.replace(/^\/api/, '');

      try {
        if (path === '/health' && req.method === 'GET') {
          if (!runtime) {
            return json(await buildHealthLight());
          }
          const rt = await getRuntime();
          return json(await buildHealth(rt));
        }

        if (path === '/subagents' && req.method === 'GET') {
          return json(listSubagents());
        }

        if (path === '/settings' && req.method === 'GET') {
          return json(getStore().getSettings());
        }

        if (path === '/settings' && req.method === 'PATCH') {
          const body = await parseBody(req);
          return json(
            getStore().setSettings(
              body as Parameters<OutlineStore['setSettings']>[0],
            ),
          );
        }

        if (path === '/workspaces' && req.method === 'GET') {
          return json(listWorkspaces(activeWorkspaceId));
        }

        if (path === '/provider' && req.method === 'GET') {
          const settings = getStore().getSettings();
          const auth = readLinerAuth();
          return json({
            model: CURSOR_DEFAULT_MODEL,
            modelLabel: 'Composer 2.5',
            workspaceSandbox: workspaceDir(settings.workspaceId),
            hasApiKey: hasCursorApiKey(),
            auth,
          });
        }

        if (path === '/provider' && req.method === 'POST') {
          const body = await parseBody(req);
          const apiKey = String(body.apiKey ?? '').trim();
          let auth = readLinerAuth();
          if (apiKey) {
            auth = setCursorApiKey(apiKey);
          } else if (body.clearKey === true) {
            auth = setCursorApiKey('');
          }
          harnessAgentBridgeInstalled = false;
          if (runtime) {
            await initRuntime(activeWorkspaceId);
          }
          return json({ ok: true, auth });
        }

        if (path === '/verify-engine' && req.method === 'POST') {
          const result = await verifyEngineConnection({
            forceCursorSdk:
              hasCursorApiKey() ||
              process.env.LINER_RPC_MODE === 'cursor-sdk',
            skip: process.env.ENGINE_SKIP === '1',
          });
          harnessAgentBridgeInstalled = false;
          if (runtime) {
            await initRuntime(activeWorkspaceId);
          }
          return json(result);
        }

        const rt = await getRuntime();
        const { store, rpc, harness } = rt;

        if (path === '/workspaces' && req.method === 'GET') {
          return json(listWorkspaces(activeWorkspaceId));
        }

        if (path === '/workspaces' && req.method === 'POST') {
          const body = await parseBody(req);
          const id = String(body.id ?? body.name ?? '').trim();
          if (!id) return json({ error: 'id required' }, 400);
          if (!isValidWorkspaceId(id)) {
            return json({ error: 'Invalid workspace id' }, 400);
          }
          try {
            const created = createWorkspace(id);
            return json(created);
          } catch (e) {
            return json({ error: String(e) }, 400);
          }
        }

        if (path === '/workspaces/switch' && req.method === 'POST') {
          const body = await parseBody(req);
          const id = String(body.workspaceId ?? body.id ?? '').trim();
          if (!id) return json({ error: 'workspaceId required' }, 400);
          try {
            const rtNext = await switchWorkspace(id);
            return json({
              ok: true,
              workspaceId: id,
              workspaces: listWorkspaces(id),
              health: await buildHealth(rtNext),
            });
          } catch (e) {
            return json({ error: String(e) }, 400);
          }
        }

        if (path === '/areas' && req.method === 'GET') {
          return json(store.listAreas());
        }

        if (path === '/areas' && req.method === 'POST') {
          const body = await parseBody(req);
          return json(
            store.createArea({
              name: String(body.name ?? 'New Area'),
              description: String(body.description ?? ''),
            }),
          );
        }

        if (path.startsWith('/areas/') && req.method === 'PATCH') {
          const id = path.split('/')[2];
          const body = await parseBody(req);
          return json(
            store.updateArea(id, {
              name: body.name as string | undefined,
              description: body.description as string | undefined,
            }),
          );
        }

        if (
          path.startsWith('/areas/') &&
          path.endsWith('/run-agent') &&
          req.method === 'POST'
        ) {
          const areaId = path.split('/')[2];
          const area = store.getArea(areaId);
          if (!area) return json({ error: 'Not found' }, 404);
          const roots = store.listPoints({ areaId, parentId: null });
          const anchor = roots[0];
          if (!anchor) {
            const created = store.createPoint({
              task: `${area.name} — area context`,
              areaId,
              state: 'todo',
              description: area.description,
            });
            const sessionId = await harness.ensurePointSession(created.id);
            const prompt = [
              'Refine this area description into a concise markdown brief.',
              'Include goals, scope, and how child tasks should be organized.',
              '',
              `Area: ${area.name}`,
              '',
              '## Current description',
              area.description.trim() || '(empty)',
            ].join('\n');
            const message = await rpc.sendMessage(sessionId, prompt);
            return json({ message });
          }
          const sessionId = await harness.ensurePointSession(anchor.id);
          const prompt = [
            'Refine the area description below. Reply with improved markdown only.',
            '',
            `Area: ${area.name}`,
            '',
            area.description.trim() || '(empty)',
          ].join('\n');
          const message = await rpc.sendMessage(sessionId, prompt);
          return json({ message });
        }

        if (path === '/points/today' && req.method === 'GET') {
          const since = url.searchParams.get('since');
          if (!since) {
            return json({ error: 'since query param required (ISO timestamp)' }, 400);
          }
          return json(store.listPointsWorkedSince(since));
        }

        if (path === '/points' && req.method === 'GET') {
          const areaId = url.searchParams.get('areaId') ?? undefined;
          const parentId = url.searchParams.get('parentId');
          return json(
            store.listPoints({
              areaId,
              parentId: parentId === 'null' ? null : parentId ?? undefined,
            }),
          );
        }

        if (path === '/points' && req.method === 'POST') {
          const body = await parseBody(req);
          const point = store.createPoint({
            task: String(body.task ?? 'Untitled'),
            areaId: String(body.areaId),
            parentId: (body.parentId as string | null) ?? null,
            state: (body.state as PointState) ?? 'backlog',
          });
          return json(point);
        }

        if (path.startsWith('/points/') && req.method === 'GET') {
          const segments = path.split('/').filter(Boolean);
          const id = segments[1];
          if (segments[2] === 'messages') {
            const point = store.getPoint(id);
            if (!point?.sessionId) return json([]);
            return json(await rpc.getMessages(point.sessionId));
          }
          if (segments[2] === 'harness-events') {
            return json(store.listHarnessEvents(id));
          }
          if (segments[2] === 'agent-status') {
            return json({ running: harness.isAgentRunning(id) });
          }
          if (segments[2] === 'events') {
            await bridgePointSession(id);
            const stream = new ReadableStream({
              start(controller) {
                const encoder = new TextEncoder();
                const write = (chunk: string) => {
                  controller.enqueue(encoder.encode(chunk));
                };
                write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
                const unsub = subscribePointSse(id, write);
                const ping = setInterval(() => broadcastPointPing(id), 25_000);
                req.signal.addEventListener('abort', () => {
                  clearInterval(ping);
                  unsub();
                  controller.close();
                });
              },
            });
            return new Response(stream, {
              headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }
          const point = store.getPoint(id);
          if (!point) return json({ error: 'Not found' }, 404);
          const children = store.getChildren(id);
          return json({ point, children });
        }

        if (path.startsWith('/points/') && req.method === 'DELETE') {
          const segments = path.split('/').filter(Boolean);
          if (segments.length !== 2) {
            return json({ error: 'Not found' }, 404);
          }
          const id = segments[1];
          const deleted = store.deletePoint(id);
          if (!deleted) return json({ error: 'Not found' }, 404);
          return json({ ok: true });
        }

        if (path.startsWith('/points/') && req.method === 'PATCH') {
          const segments = path.split('/').filter(Boolean);
          const id = segments[1];
          if (segments[2] === 'reorder') {
            const body = await parseBody(req);
            const childIds = body.childIds as string[];
            if (!Array.isArray(childIds)) {
              return json({ error: 'childIds required' }, 400);
            }
            const updated = store.reorderChildren(id, childIds);
            if (!updated) return json({ error: 'Not found' }, 404);
            return json(updated);
          }
          if (segments[2] === 'move') {
            const body = await parseBody(req);
            const parentId =
              body.parentId === null || body.parentId === undefined
                ? null
                : (body.parentId as string);
            const afterId =
              body.afterId === null || body.afterId === undefined
                ? undefined
                : (body.afterId as string);
            const moved = store.movePoint(id, parentId, afterId);
            if (!moved) return json({ error: 'Not found' }, 404);
            return json(moved);
          }
          const body = await parseBody(req);
          const existing = store.getPoint(id);
          if (!existing) return json({ error: 'Not found' }, 404);
          const newState = body.state as PointState | undefined;
          const metaPatch = body.meta as Record<string, unknown> | undefined;
          const updated = store.updatePoint(id, {
            task: body.task as string | undefined,
            description: body.description as string | undefined,
            notes: body.notes as string | undefined,
            state: newState,
            priority: body.priority as PointPriority | undefined,
            meta: metaPatch,
          });
          if (newState && newState !== existing.state) {
            broadcastStateChange(id, existing.state, newState, 'human');
            await harness.onPointStateChange(id, newState, existing.state);
            const auto = await harness.maybeAutoRunAgent(
              id,
              newState,
              existing.state,
            );
            if (auto?.stateChanged && auto.stateChanged !== newState) {
              const after = store.getPoint(id);
              if (after) {
                broadcastStateChange(
                  id,
                  newState,
                  after.state,
                  'agent',
                );
              }
            }
          }
          return json(store.getPoint(id) ?? updated);
        }


        if (
          path.startsWith('/points/') &&
          path.endsWith('/permission') &&
          req.method === 'POST'
        ) {
          const id = path.split('/')[2];
          const body = await parseBody(req);
          const requestId = String(body.requestId ?? '');
          const approved = body.approved === true;
          if (!requestId) return json({ error: 'requestId required' }, 400);
          await harness.respondToPermission(id, requestId, approved);
          store.touchPoint(id);
          return json({ ok: true });
        }

        if (
          path.startsWith('/points/') &&
          path.endsWith('/run-agent') &&
          req.method === 'POST'
        ) {
          const id = path.split('/')[2];
          const body = await parseBody(req);
          const intent = String(body.intent ?? 'plan') as AgentIntent;
          const childId = body.childId as string | undefined;
          const result = await harness.runAgent(id, intent, childId);
          store.touchPoint(id);
          return json(result);
        }

        if (path.startsWith('/points/') && path.endsWith('/session') && req.method === 'POST') {
          const id = path.split('/')[2];
          const sessionId = await harness.ensurePointSession(id);
          await bridgePointSession(id);
          return json({ sessionId });
        }

        if (path.startsWith('/points/') && path.endsWith('/messages') && req.method === 'POST') {
          const id = path.split('/')[2];
          const body = await parseBody(req);
          let content = String(body.content ?? '');
          const quote = body.quote as string | undefined;
          if (quote) content = prependQuote(content, quote);
          const resolved = resolveMentions(content);
          const point = store.getPoint(id);
          if (!point) return json({ error: 'Not found' }, 404);
          const sessionId = await harness.ensurePointSession(id);
          await bridgePointSession(id);
          if (!sessionId) return json({ error: 'No session' }, 500);
          const msg = await rpc.sendMessage(sessionId, resolved.text, {
            quotedPlan: quote,
            mentionAgents: resolved.agents,
            mentionSkills: resolved.skills,
          });
          store.touchPoint(id);
          broadcastPointMessage(id, msg);
          return json(msg);
        }

        if (path === '/skills' && req.method === 'GET') {
          const settings = store.getSettings();
          return json(listSkills(settings.workspaceId));
        }

        return json({ error: 'Not found' }, 404);
      } catch (e) {
        return json({ error: String(e) }, 500);
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
