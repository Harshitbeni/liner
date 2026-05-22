import type {
  Area,
  HarnessEvent,
  LinerSettings,
  Point,
  ThreadMessage,
} from '@liner/core';

function resolveApiBase(): string {
  if (typeof window !== 'undefined' && window.liner?.apiBase) {
    return window.liner.apiBase;
  }
  const env = import.meta.env.VITE_LINER_API;
  if (env && String(env).length > 0) return String(env);
  return 'http://127.0.0.1:9240/api';
}

const API_BASE = resolveApiBase();

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

function requestAbortSignal(timeoutMs: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

async function request<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...fetchInit } = init ?? {};
  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchInit,
    signal: requestAbortSignal(timeoutMs),
    headers: {
      'Content-Type': 'application/json',
      ...fetchInit.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export type EngineHealth = {
  name: string;
  version: string | null;
  state: string;
  source: string;
  platform?: string;
  arch?: string;
  error: string | null;
  packaged: boolean;
};

export type HealthResponse = {
  ok: boolean;
  rpc: string;
  connected: boolean;
  engineReachable?: boolean;
  /** @deprecated use engineReachable */
  craftReachable?: boolean;
  lastError: string | null;
  workspaceId?: string;
  engine?: EngineHealth;
};

export type VerifyEngineResponse = {
  exitCode: number;
  ok: boolean;
  message: string;
  rpcMode?: string;
  skipped?: boolean;
};

export type ProviderConfigResponse = {
  providers: Array<{ id: string; label: string; hint: string }>;
  selectedProviderId: string;
  auth: Record<string, unknown>;
};

export type WorkspaceInfo = {
  id: string;
  path: string;
  isActive: boolean;
};

export type SseHandlers = {
  onMessage: (message: ThreadMessage) => void;
  onAgentStatus?: (running: boolean) => void;
  onStateChange?: (
    from: string,
    to: string,
    actor: 'human' | 'agent' | 'harness',
  ) => void;
  onConnected?: () => void;
};

export function subscribePointEvents(
  pointId: string,
  handlers: SseHandlers,
): () => void {
  const source = new EventSource(`${API_BASE}/points/${pointId}/events`);
  source.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data) as {
        type: string;
        message?: ThreadMessage;
        running?: boolean;
        from?: string;
        to?: string;
        actor?: 'human' | 'agent' | 'harness';
      };
      if (data.type === 'connected') handlers.onConnected?.();
      if (data.type === 'message' && data.message) {
        handlers.onMessage(data.message);
      }
      if (data.type === 'agent_status' && typeof data.running === 'boolean') {
        handlers.onAgentStatus?.(data.running);
      }
      if (
        data.type === 'state_change' &&
        data.from &&
        data.to &&
        data.actor
      ) {
        handlers.onStateChange?.(data.from, data.to, data.actor);
      }
    } catch {
      /* ignore malformed */
    }
  };
  source.onerror = () => {
    source.close();
  };
  return () => source.close();
}

export const api = {
  health: () => request<HealthResponse>('/health'),
  verifyEngine: () =>
    request<VerifyEngineResponse>('/verify-engine', { method: 'POST' }),
  verifyCraft: () =>
    request<VerifyEngineResponse>('/verify-craft', { method: 'POST' }),
  getProviderConfig: () => request<ProviderConfigResponse>('/provider'),
  saveProviderConfig: (body: {
    providerId: string;
    apiKey?: string;
    selectedProviderId?: string;
  }) =>
    request<{ ok: boolean; auth: Record<string, unknown> }>('/provider', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listWorkspaces: () => request<WorkspaceInfo[]>('/workspaces'),
  createWorkspace: (id: string) =>
    request<WorkspaceInfo>('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),
  switchWorkspace: (workspaceId: string) =>
    request<{
      ok: boolean;
      workspaceId: string;
      workspaces: WorkspaceInfo[];
      health: HealthResponse;
    }>('/workspaces/switch', {
      method: 'POST',
      body: JSON.stringify({ workspaceId }),
    }),
  listAreas: () => request<Area[]>('/areas'),
  createArea: (name: string) =>
    request<Area>('/areas', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  updateArea: (id: string, patch: Partial<Area>) =>
    request<Area>(`/areas/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  listPoints: (areaId: string, parentId?: string | null) => {
    const params = new URLSearchParams({ areaId });
    if (parentId !== undefined) {
      params.set('parentId', parentId === null ? 'null' : parentId);
    }
    return request<Point[]>(`/points?${params}`);
  },
  listTodayPoints: (since: string) => {
    const params = new URLSearchParams({ since });
    return request<Point[]>(`/points/today?${params}`);
  },
  getPoint: (id: string) =>
    request<{ point: Point; children: Point[] }>(`/points/${id}`),
  createPoint: (input: {
    task: string;
    areaId: string;
    parentId?: string | null;
    state?: Point['state'];
  }) =>
    request<Point>('/points', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updatePoint: (id: string, patch: Partial<Point>) =>
    request<Point>(`/points/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  reorderChildren: (parentId: string, childIds: string[]) =>
    request<Point>(`/points/${parentId}/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ childIds }),
    }),
  movePoint: (
    id: string,
    input: { parentId: string | null; afterId?: string | null },
  ) =>
    request<Point>(`/points/${id}/move`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  ensureSession: (id: string) =>
    request<{ sessionId: string }>(`/points/${id}/session`, { method: 'POST' }),
  getMessages: (id: string) => request<ThreadMessage[]>(`/points/${id}/messages`),
  sendMessage: (id: string, content: string, quote?: string) =>
    request<ThreadMessage>(`/points/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, quote }),
    }),
  runAgent: (
    id: string,
    intent: 'plan' | 'execute' | 'review',
    childId?: string,
  ) =>
    request<{ message: ThreadMessage | null; stateChanged?: string }>(
      `/points/${id}/run-agent`,
      {
        method: 'POST',
        body: JSON.stringify({ intent, childId }),
      },
    ),
  getSettings: () => request<LinerSettings>('/settings'),
  updateSettings: (patch: Partial<LinerSettings>) =>
    request<LinerSettings>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  listSubagents: () =>
    request<Array<{ id: string; label: string; description: string }>>(
      '/subagents',
    ),
  listSkills: () =>
    request<Array<{ id: string; label: string; description: string }>>(
      '/skills',
    ),
  listHarnessEvents: (pointId: string) =>
    request<HarnessEvent[]>(`/points/${pointId}/harness-events`),
  getAgentStatus: (pointId: string) =>
    request<{ running: boolean }>(`/points/${pointId}/agent-status`),
  respondToPermission: (
    pointId: string,
    requestId: string,
    approved: boolean,
  ) =>
    request<{ ok: boolean }>(`/points/${pointId}/permission`, {
      method: 'POST',
      body: JSON.stringify({ requestId, approved }),
    }),
  runAreaAgent: (areaId: string) =>
    request<{ message: ThreadMessage | null }>(`/areas/${areaId}/run-agent`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
};
