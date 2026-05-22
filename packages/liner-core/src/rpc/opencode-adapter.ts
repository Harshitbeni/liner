import { v4 as uuid } from 'uuid';
import {
  createOpencodeClient,
  type OpencodeClient,
  type Event,
  type Part,
  type ToolPart,
  type Permission,
} from '@opencode-ai/sdk';
import type {
  ThreadMessage,
  ThreadMessageRole,
  ThreadPermissionRequest,
  ThreadToolBlock,
} from '../types';
import { isMockFallbackAllowed } from '../engine-info';
import { isOpencodeServerReachable } from './opencode-detect';
import type { EnsureSessionOptions, OpenCodeRpcConfig, SessionRpcAdapter } from './types';
import { MockSessionRpcAdapter } from './mock-adapter';

type ImagePartMeta = { url: string; mime?: string; filename?: string };

/**
 * OpenCode HTTP RPC adapter via @opencode-ai/sdk.
 * Falls back to mock when the server is unavailable (unless packaged / strict mode).
 */
export class OpenCodeSessionRpcAdapter implements SessionRpcAdapter {
  readonly mode = 'opencode' as const;
  private client: OpencodeClient | null = null;
  private connected = false;
  private fallback: MockSessionRpcAdapter;
  private useFallback = false;
  private connectError: string | null = null;
  private eventHandlers = new Map<string, Set<(msg: ThreadMessage) => void>>();
  private streamBuffers = new Map<string, string>();
  private toolBlocks = new Map<string, Map<string, ThreadToolBlock>>();
  private seededSessions = new Set<string>();
  private eventAborter: AbortController | null = null;

  constructor(
    private config: OpenCodeRpcConfig,
    private options?: { allowMockFallback?: boolean },
  ) {
    this.fallback = new MockSessionRpcAdapter();
  }

  private allowMockFallback(): boolean {
    return (
      this.options?.allowMockFallback === true || isMockFallbackAllowed()
    );
  }

  async connect(): Promise<void> {
    try {
      this.client = createOpencodeClient({ baseUrl: this.config.baseUrl });
      const ok = await isOpencodeServerReachable(this.config.baseUrl, 3_000);
      if (!ok) throw new Error('OpenCode server unreachable');
      this.useFallback = false;
      this.connectError = null;
      this.connected = true;
      void this.startEventPump();
    } catch (e) {
      this.connectError =
        e instanceof Error ? e.message : 'OpenCode server unreachable';
      if (!this.allowMockFallback()) {
        this.useFallback = false;
        this.connected = false;
        this.client = null;
        throw new Error(this.connectError);
      }
      await this.fallback.connect();
      this.useFallback = true;
      this.connected = true;
    }
  }

  private async startEventPump(): Promise<void> {
    if (!this.client || this.useFallback) return;
    this.eventAborter?.abort();
    this.eventAborter = new AbortController();
    try {
      const stream = await this.client.global.event();
      for await (const raw of stream.stream) {
        if (this.eventAborter?.signal.aborted) break;
        const wrapped = raw as { payload?: Event };
        const event: Event = wrapped.payload ?? (raw as unknown as Event);
        if (event) this.handleGlobalEvent(event);
      }
    } catch {
      /* stream ended */
    }
  }

  private handleGlobalEvent(event: Event): void {
    switch (event.type) {
      case 'message.part.updated':
        this.handlePartUpdated(event.properties.part, event.properties.delta);
        break;
      case 'permission.updated':
        this.handlePermissionUpdated(event.properties);
        break;
      case 'session.idle': {
        const sessionId = event.properties.sessionID;
        this.finalizeStream(sessionId);
        break;
      }
      case 'message.updated': {
        const info = event.properties.info;
        if (info.role === 'assistant' && info.time.completed) {
          this.finalizeStream(info.sessionID);
        }
        break;
      }
      default:
        break;
    }
  }

  private handlePartUpdated(part: Part, delta?: string): void {
    const sessionId = part.sessionID;
    if (!sessionId) return;

    if (part.type === 'text') {
      const textPart = part as { text: string };
      const next =
        delta != null
          ? (this.streamBuffers.get(sessionId) ?? '') + delta
          : textPart.text;
      this.streamBuffers.set(sessionId, next);
      this.emit(sessionId, {
        id: `stream-${sessionId}`,
        sessionId,
        role: 'assistant',
        content: next,
        createdAt: new Date().toISOString(),
        meta: { collapsedTools: true, streaming: true },
      });
      return;
    }

    if (part.type === 'tool') {
      this.applyToolPart(sessionId, part as ToolPart);
    }
  }

  private applyToolPart(sessionId: string, part: ToolPart): void {
    const tools = this.toolBlocksFor(sessionId);
    const state = part.state;
    const status: ThreadToolBlock['status'] =
      state.status === 'running' || state.status === 'pending'
        ? 'running'
        : 'done';
    tools.set(part.callID, {
      toolUseId: part.callID,
      toolName: part.tool,
      input: 'input' in state ? state.input : undefined,
      result:
        state.status === 'completed'
          ? state.output
          : state.status === 'error'
            ? state.error
            : undefined,
      isError: state.status === 'error',
      status,
    });
    this.emitToolUpdate(sessionId);
  }

  private handlePermissionUpdated(perm: Permission): void {
    const sessionId = perm.sessionID;
    const permissionRequest: ThreadPermissionRequest = {
      requestId: perm.id,
      summary: perm.title || perm.type || 'Permission required',
      toolName: perm.type,
    };
    this.emit(sessionId, {
      id: `perm-${perm.id}`,
      sessionId,
      role: 'system',
      content: permissionRequest.summary,
      createdAt: new Date().toISOString(),
      meta: { permissionRequest },
    });
  }

  private finalizeStream(sessionId: string): void {
    const buffered = this.streamBuffers.get(sessionId);
    if (!buffered) return;
    this.streamBuffers.delete(sessionId);
    this.emit(sessionId, {
      id: uuid(),
      sessionId,
      role: 'assistant',
      content: buffered,
      createdAt: new Date().toISOString(),
      meta: { collapsedTools: true },
    });
  }

  async disconnect(): Promise<void> {
    if (this.useFallback) return this.fallback.disconnect();
    this.eventAborter?.abort();
    this.eventAborter = null;
    this.client = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.useFallback ? this.fallback.isConnected() : this.connected;
  }

  isOpencodeNative(): boolean {
    return !this.useFallback && this.connected;
  }

  getLastError(): string | null {
    return this.connectError;
  }

  async ensureSession(
    sessionId: string | null,
    options?: EnsureSessionOptions,
  ): Promise<string> {
    if (this.useFallback) {
      return this.fallback.ensureSession(sessionId, options);
    }
    if (!this.client) throw new Error('Not connected');

    if (sessionId) {
      try {
        const existing = await this.client.session.get({
          path: { id: sessionId },
        });
        if (existing.data) return sessionId;
      } catch {
        /* create fresh */
      }
    }

    const created = await this.client.session.create({
      body: { title: options?.title ?? 'Liner point thread' },
    });
    const id = created.data?.id ?? uuid();

    if (options?.context && !this.seededSessions.has(id)) {
      this.seededSessions.add(id);
      try {
        await this.client.session.prompt({
          path: { id },
          body: {
            noReply: true,
            parts: [
              {
                type: 'text',
                text: `[Liner context — not a user task]\n\n${options.context}`,
              },
            ],
          },
        });
      } catch {
        /* best-effort */
      }
    }

    return id;
  }

  async getMessages(sessionId: string): Promise<ThreadMessage[]> {
    if (this.useFallback) return this.fallback.getMessages(sessionId);
    if (!this.client) return [];
    try {
      const res = await this.client.session.messages({ path: { id: sessionId } });
      const rows = res.data ?? [];
      const out: ThreadMessage[] = [];
      for (const row of rows) {
        const msg = opencodeRowToThread(sessionId, row.info, row.parts);
        if (msg) out.push(msg);
      }
      return out;
    } catch {
      return this.fallback.getMessages(sessionId);
    }
  }

  async sendMessage(
    sessionId: string,
    content: string,
    meta?: ThreadMessage['meta'],
  ): Promise<ThreadMessage> {
    if (this.useFallback) {
      return this.fallback.sendMessage(sessionId, content, meta);
    }
    if (!this.client) throw new Error('Not connected');

    const parts: Array<
      | { type: 'text'; text: string }
      | { type: 'file'; mime: string; url: string; filename?: string }
    > = [{ type: 'text', text: content }];

    const images = (meta as { images?: ImagePartMeta[] } | undefined)?.images;
    if (images?.length) {
      for (const img of images) {
        parts.push({
          type: 'file',
          mime: img.mime ?? 'image/png',
          url: img.url,
          filename: img.filename,
        });
      }
    }

    try {
      await this.client.session.promptAsync({
        path: { id: sessionId },
        body: { parts },
      });
      const msg: ThreadMessage = {
        id: uuid(),
        sessionId,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
        meta,
      };
      this.emit(sessionId, msg);
      return msg;
    } catch {
      return this.fallback.sendMessage(sessionId, content, meta);
    }
  }

  async respondToPermission(
    sessionId: string,
    requestId: string,
    approved: boolean,
  ): Promise<void> {
    if (this.useFallback) return;
    if (!this.client) return;
    await this.client.postSessionIdPermissionsPermissionId({
      path: { id: sessionId, permissionID: requestId },
      body: { response: approved ? 'once' : 'reject' },
    });
  }

  subscribe(
    sessionId: string,
    onMessage: (msg: ThreadMessage) => void,
  ): () => void {
    if (this.useFallback) {
      return this.fallback.subscribe(sessionId, onMessage);
    }
    if (!this.eventHandlers.has(sessionId)) {
      this.eventHandlers.set(sessionId, new Set());
    }
    this.eventHandlers.get(sessionId)!.add(onMessage);
    return () => this.eventHandlers.get(sessionId)?.delete(onMessage);
  }

  private toolBlocksFor(sessionId: string): Map<string, ThreadToolBlock> {
    if (!this.toolBlocks.has(sessionId)) {
      this.toolBlocks.set(sessionId, new Map());
    }
    return this.toolBlocks.get(sessionId)!;
  }

  private emitToolUpdate(sessionId: string): void {
    const tools = [...this.toolBlocksFor(sessionId).values()];
    const streaming: ThreadMessage = {
      id: `tools-${sessionId}`,
      sessionId,
      role: 'assistant',
      content: tools.length
        ? `Running ${tools.filter((t) => t.status === 'running').length} tool(s)…`
        : '',
      createdAt: new Date().toISOString(),
      meta: { collapsedTools: true, streaming: true, tools },
    };
    this.emit(sessionId, streaming);
  }

  private emit(sessionId: string, msg: ThreadMessage): void {
    for (const fn of this.eventHandlers.get(sessionId) ?? []) {
      fn(msg);
    }
  }
}

function opencodeRowToThread(
  sessionId: string,
  info: { id: string; role: string; time?: { created: number } },
  parts: Part[],
): ThreadMessage | null {
  const role = mapRole(info.role);
  if (!role) return null;
  const text = parts
    .filter((p): p is Part & { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
  const tools = parts
    .filter((p): p is ToolPart => p.type === 'tool')
    .map(toolPartToBlock);

  return {
    id: info.id,
    sessionId,
    role,
    content: text,
    createdAt: new Date(info.time?.created ?? Date.now()).toISOString(),
    meta: {
      collapsedTools: role === 'assistant',
      tools: tools.length ? tools : undefined,
    },
  };
}

function toolPartToBlock(part: ToolPart): ThreadToolBlock {
  const state = part.state;
  const status: ThreadToolBlock['status'] =
    state.status === 'running' || state.status === 'pending'
      ? 'running'
      : 'done';
  return {
    toolUseId: part.callID,
    toolName: part.tool,
    input: 'input' in state ? state.input : undefined,
    result:
      state.status === 'completed'
        ? state.output
        : state.status === 'error'
          ? state.error
          : undefined,
    isError: state.status === 'error',
    status,
  };
}

function mapRole(role?: string): ThreadMessageRole | null {
  if (role === 'user' || role === 'human') return 'user';
  if (role === 'assistant' || role === 'agent') return 'assistant';
  if (role === 'system') return 'system';
  return null;
}
