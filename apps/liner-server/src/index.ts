import { join } from 'node:path';
import {
  applyEngineEnv,
  createLinerRuntime,
  createWorkspace,
  OpenCodeSessionRpcAdapter,
  getEngineInfo,
  isOpencodeServerReachable,
  isManagedEngineEnabled,
  isMockFallbackAllowed,
  isPackagedMode,
  listWorkspaces,
  isValidWorkspaceId,
  readLinerAuth,
  setProviderApiKey,
  PROVIDER_OPTIONS,
  resolveBunExecutable,
  startManagedEngine,
  stopManagedEngine,
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

async function initRuntime(workspaceId?: string): Promise<NonNullable<typeof runtime>> {
  const id = workspaceId ?? activeWorkspaceId;
  activeWorkspaceId = id;
  const preferred = process.env.LINER_RPC_MODE as 'mock' | 'opencode' | undefined;
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
  if (isManagedEngineEnabled()) await ensureEngineBoot();
  if (!runtime) {
    return initRuntime(activeWorkspaceId);
  }
  return runtime;
}

async function switchWorkspace(workspaceId: string) {
  if (!isValidWorkspaceId(workspaceId)) {
    throw new Error('Invalid workspace id');
  }
  harnessAgentBridgeInstalled = false;
  return initRuntime(workspaceId);
}

async function buildHealthLight(): Promise<{
  ok: boolean;
  rpc: string;
  connected: boolean;
  engineReachable: boolean;
  craftReachable: boolean;
  lastError: string | null;
  workspaceId: string;
  engine: ReturnType<typeof getEngineInfo>;
}> {
  const engine = getEngineInfo();
  const baseUrl =
    process.env.OPENCODE_BASE_URL ?? 'http://127.0.0.1:4096';
  const rpcMode = process.env.LINER_RPC_MODE ?? 'opencode';
  let engineReachable = false;
  let lastError: string | null = engine.error;

  if (engine.state === 'ready' || engine.state === 'starting') {
    engineReachable = await isOpencodeServerReachable(baseUrl, 5_000);
  }

  if (engine.state === 'starting' && !engineReachable) {
    lastError = lastError ?? 'AI engine is starting…';
  }

  return {
    ok: true,
    rpc: rpcMode,
    connected: false,
    engineReachable,
    craftReachable: engineReachable,
    lastError,
    workspaceId: activeWorkspaceId,
    engine,
  };
}

async function buildHealth(rt: Awaited<ReturnType<typeof getRuntime>>) {
  const { store, rpc } = rt;
  const settings = store.getSettings();
  const connected = rpc.isConnected();
  let engineReachable = false;
  let lastError: string | null = null;

  if (rpc.mode === 'opencode' && rpc instanceof OpenCodeSessionRpcAdapter) {
    engineReachable = rpc.isOpencodeNative();
    lastError = rpc.getLastError();
    if (!engineReachable) {
      engineReachable = await isOpencodeServerReachable(
        settings.opencodeBaseUrl,
        5_000,
      );
    }
  } else {
    engineReachable = await isOpencodeServerReachable(
      settings.opencodeBaseUrl,
      5_000,
    );
    if (rpc.mode === 'mock') {
      lastError = engineReachable
        ? null
        : isPackagedMode()
          ? 'AI engine unavailable — using demo mode. Check Settings → AI Provider.'
          : 'Using mock RPC — OpenCode server not reachable';
    }
  }

  const engine = getEngineInfo();
  if (
    rpc.mode === 'opencode' &&
    rpc instanceof OpenCodeSessionRpcAdapter &&
    !rpc.isOpencodeNative()
  ) {
    const err =
      rpc.getLastError() ??
      engine.error ??
      'OpenCode RPC unreachable';
    lastError = lastError ?? err;
    if (isMockFallbackAllowed()) {
      engine.state = 'mock-fallback';
      if (!lastError) {
        lastError = 'Connected via demo fallback';
      }
    } else {
      engine.state = 'failed';
    }
  }

  if (isPackagedMode() && engine.state === 'ready' && engineReachable) {
    engine.state = 'ready';
  } else if (isPackagedMode() && engine.state === 'starting' && engineReachable) {
    engine.state = 'ready';
  }

  return {
    ok: true,
    rpc: rpc.mode,
    connected,
    engineReachable,
    craftReachable: engineReachable,
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

async function bootManagedEngine(): Promise<void> {
  if (!isManagedEngineEnabled()) return;

  if (!process.env.LINER_RPC_MODE) {
    process.env.LINER_RPC_MODE = 'opencode';
  }

  const isPackaged = isPackagedMode();
  const repoRoot =
    process.env.LINER_REPO_ROOT ?? join(import.meta.dir, '..', '..', '..');
  const resourcesPath = process.env.LINER_RESOURCES_PATH;
  const { path: bunPath } = resolveBunExecutable({
    isPackaged,
    resourcesPath,
  });

  const result = await startManagedEngine({
    isPackaged,
    resourcesPath,
    repoRoot,
    engineRootOverride: process.env.LINER_ENGINE_ROOT,
    opencodePort: Number(process.env.OPENCODE_PORT ?? 4096),
    opencodeBaseUrl:
      process.env.OPENCODE_BASE_URL ?? 'http://127.0.0.1:4096',
    bunPath,
    pipeStdio: isPackaged,
    waitTimeoutMs: isPackaged ? 180_000 : 45_000,
  });
  applyEngineEnv(result);

  if (result.state === 'ready') {
    if (result.reason === 'already-running') {
      console.log(
        '[liner] AI engine already running at',
        process.env.OPENCODE_BASE_URL ?? 'http://127.0.0.1:4096',
      );
    } else {
      console.log('[liner] AI engine ready');
    }
  } else {
    console.warn('[liner]', result.error ?? 'AI engine failed to start');
  }
}

function registerEngineShutdown(): void {
  const onStop = () => {
    stopManagedEngine();
  };
  process.on('SIGINT', onStop);
  process.on('SIGTERM', onStop);
  process.on('exit', onStop);
}

let engineBootPromise: Promise<void> | null = null;

function ensureEngineBoot(): Promise<void> {
  if (!engineBootPromise) {
    applyEngineEnv({
      state: 'starting',
      error: null,
      version: null,
      source: isPackagedMode() ? 'bundled' : 'dev',
      started: false,
    });
    engineBootPromise = bootManagedEngine().catch((e) => {
      console.warn('[liner] engine boot failed', e);
    });
  }
  return engineBootPromise;
}

registerEngineShutdown();
if (isManagedEngineEnabled()) {
  void ensureEngineBoot();
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
            if (isManagedEngineEnabled()) void ensureEngineBoot();
            return json(await buildHealthLight());
          }
          const rt = await getRuntime();
          return json(await buildHealth(rt));
        }

        if (isManagedEngineEnabled()) await ensureEngineBoot();
        const rt = await getRuntime();
        const { store, rpc, harness } = rt;

        if (
          (path === '/verify-engine' || path === '/verify-craft') &&
          req.method === 'POST'
        ) {
          await ensureEngineBoot();
          const rtForVerify = await getRuntime();
          const settings = rtForVerify.store.getSettings();
          let engineReachable = await isOpencodeServerReachable(
            settings.opencodeBaseUrl,
            8_000,
          );
          if (isManagedEngineEnabled() && !engineReachable) {
            stopManagedEngine();
            engineBootPromise = null;
            await ensureEngineBoot();
            harnessAgentBridgeInstalled = false;
            await initRuntime(activeWorkspaceId);
          }
          const { verifyEngineConnection } = await import('@liner/core');
          const rtFresh = await getRuntime();
          const freshSettings = rtFresh.store.getSettings();
          const result = await verifyEngineConnection({
            opencodeBaseUrl: freshSettings.opencodeBaseUrl,
            forceOpencode: process.env.LINER_RPC_MODE === 'opencode',
            skip:
              process.env.ENGINE_SKIP === '1' || process.env.CRAFT_SKIP === '1',
          });
          return json(result);
        }

        if (path === '/provider' && req.method === 'GET') {
          const settings = store.getSettings();
          const auth = readLinerAuth();
          return json({
            providers: PROVIDER_OPTIONS,
            selectedProviderId: settings.aiProviderId,
            auth,
          });
        }

        if (path === '/provider' && req.method === 'POST') {
          const body = await parseBody(req);
          const providerId = String(body.providerId ?? '').trim();
          const apiKey = String(body.apiKey ?? '');
          if (!providerId) return json({ error: 'providerId required' }, 400);
          const auth = setProviderApiKey(providerId, apiKey);
          if (body.selectedProviderId) {
            store.setSettings({
              aiProviderId: String(body.selectedProviderId),
            });
          } else {
            store.setSettings({ aiProviderId: providerId });
          }
          return json({ ok: true, auth });
        }

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

        if (path === '/settings' && req.method === 'GET') {
          return json(store.getSettings());
        }

        if (path === '/settings' && req.method === 'PATCH') {
          const body = await parseBody(req);
          return json(store.setSettings(body as Parameters<typeof store.setSettings>[0]));
        }

        if (path === '/subagents' && req.method === 'GET') {
          const { listSubagents } = await import('@liner/core');
          return json(listSubagents());
        }

        if (path === '/skills' && req.method === 'GET') {
          const { listSkills } = await import('@liner/core');
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
