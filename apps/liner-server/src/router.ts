import {
  createWorkspace,
  CURSOR_DEFAULT_MODEL,
  OutlineStore,
  hasCursorApiKey,
  listWorkspaces,
  isValidWorkspaceId,
  setCursorApiKey,
  workspaceDir,
  listSubagents,
  listSkills,
  verifyEngineConnection,
  resolveRuntimeHealth,
  resolveRuntimeHealthLight,
  resolveMentions,
  prependQuote,
} from '@liner/core';
import {
  isApprovalFlagged,
  type AgentIntent,
  type PointState,
  type PointPriority,
} from '@liner/core';
import type { createLinerRuntime } from '@liner/core';
import {
  broadcastPointMessage,
  broadcastPointPing,
  broadcastStateChange,
  subscribePointSse,
} from './sse';

export type LinerRuntime = NonNullable<
  Awaited<ReturnType<typeof createLinerRuntime>>
>;

export type ServerRouterDeps = {
  getActiveWorkspaceId: () => string;
  hasRuntime: () => boolean;
  getStore: () => OutlineStore;
  getRuntime: () => Promise<LinerRuntime>;
  initRuntime: (workspaceId?: string) => Promise<LinerRuntime>;
  switchWorkspace: (workspaceId: string) => Promise<LinerRuntime>;
  resetHarnessBridge: () => void;
  bridgePointSession: (pointId: string) => Promise<void>;
};

export function json(data: unknown, status = 200): Response {
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

export async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Routes that do not require an initialized RPC runtime. */
async function handlePreRuntimeRoute(
  deps: ServerRouterDeps,
  req: Request,
  path: string,
): Promise<Response | null> {
  if (path === '/health' && req.method === 'GET') {
    if (!deps.hasRuntime()) {
      return json(resolveRuntimeHealthLight(deps.getActiveWorkspaceId()));
    }
    const rt = await deps.getRuntime();
    return json(resolveRuntimeHealth(rt.store.workspaceId, rt.rpc));
  }

  if (path === '/subagents' && req.method === 'GET') {
    return json(listSubagents());
  }

  if (path === '/settings' && req.method === 'GET') {
    return json(deps.getStore().getSettings());
  }

  if (path === '/settings' && req.method === 'PATCH') {
    const body = await parseBody(req);
    return json(
      deps.getStore().setSettings(
        body as Parameters<OutlineStore['setSettings']>[0],
      ),
    );
  }

  if (path === '/workspaces' && req.method === 'GET') {
    return json(listWorkspaces(deps.getActiveWorkspaceId()));
  }

  if (path === '/provider' && req.method === 'GET') {
    const settings = deps.getStore().getSettings();
    return json({
      model: CURSOR_DEFAULT_MODEL,
      modelLabel: 'Composer 2.5',
      workspaceSandbox: workspaceDir(settings.workspaceId),
      hasApiKey: hasCursorApiKey(),
    });
  }

  if (path === '/provider' && req.method === 'POST') {
    const body = await parseBody(req);
    const apiKey = String(body.apiKey ?? '').trim();
    if (apiKey) {
      setCursorApiKey(apiKey);
    } else if (body.clearKey === true) {
      setCursorApiKey('');
    }
    deps.resetHarnessBridge();
    if (deps.hasRuntime()) {
      await deps.initRuntime(deps.getActiveWorkspaceId());
    }
    return json({ ok: true, hasApiKey: hasCursorApiKey() });
  }

  if (path === '/verify-engine' && req.method === 'POST') {
    const result = await verifyEngineConnection({
      forceCursorSdk:
        hasCursorApiKey() || process.env.LINER_RPC_MODE === 'cursor-sdk',
      skip: process.env.ENGINE_SKIP === '1',
    });
    deps.resetHarnessBridge();
    if (deps.hasRuntime()) {
      await deps.initRuntime(deps.getActiveWorkspaceId());
    }
    return json(result);
  }

  return null;
}

export async function handleApiRequest(
  deps: ServerRouterDeps,
  req: Request,
  url: URL,
): Promise<Response> {
  const path = url.pathname.replace(/^\/api/, '');

  const preRuntime = await handlePreRuntimeRoute(deps, req, path);
  if (preRuntime) return preRuntime;

  const rt = await deps.getRuntime();
  const { store, rpc, harness } = rt;

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
      const rtNext = await deps.switchWorkspace(id);
      return json({
        ok: true,
        workspaceId: id,
        workspaces: listWorkspaces(id),
        health: resolveRuntimeHealth(rtNext.store.workspaceId, rtNext.rpc),
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

  if (path.startsWith('/areas/') && req.method === 'DELETE') {
    const segments = path.split('/').filter(Boolean);
    if (segments.length !== 2) {
      return json({ error: 'Not found' }, 404);
    }
    const id = segments[1];
    const deleted = store.deleteArea(id);
    if (!deleted) return json({ error: 'Not found' }, 404);
    return json({ ok: true });
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
      taskDescription:
        typeof body.taskDescription === 'string'
          ? body.taskDescription
          : undefined,
      taskPhotos: Array.isArray(body.taskPhotos) ? body.taskPhotos : undefined,
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
      await deps.bridgePointSession(id);
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
      taskDescription: body.taskDescription as string | undefined,
      taskPhotos: Array.isArray(body.taskPhotos) ? body.taskPhotos : undefined,
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
          broadcastStateChange(id, newState, after.state, 'agent');
        }
      }
    }

    const finalPoint = store.getPoint(id) ?? updated;
    if (
      metaPatch &&
      existing.parentId &&
      isApprovalFlagged(existing) &&
      finalPoint &&
      !isApprovalFlagged(finalPoint)
    ) {
      await harness.syncParentFromChildren(existing.parentId);
      await harness.checkParentCompletion(existing.parentId);
    }

    return json(finalPoint);
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

  if (
    path.startsWith('/points/') &&
    path.endsWith('/session') &&
    req.method === 'POST'
  ) {
    const id = path.split('/')[2];
    const sessionId = await harness.ensurePointSession(id);
    await deps.bridgePointSession(id);
    return json({ sessionId });
  }

  if (
    path.startsWith('/points/') &&
    path.endsWith('/messages') &&
    req.method === 'POST'
  ) {
    const id = path.split('/')[2];
    const body = await parseBody(req);
    let content = String(body.content ?? '');
    const quote = body.quote as string | undefined;
    if (quote) content = prependQuote(content, quote);
    const resolved = resolveMentions(content);
    const point = store.getPoint(id);
    if (!point) return json({ error: 'Not found' }, 404);
    const sessionId = await harness.ensurePointSession(id);
    await deps.bridgePointSession(id);
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
}
