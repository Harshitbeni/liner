import { v4 as uuid } from 'uuid';
import {
  CRAFT_CHANNELS,
  CRAFT_PROTOCOL_VERSION,
  type CraftSessionEvent,
  type CraftWireEnvelope,
} from '../craft-protocol';
import type {
  ThreadMessage,
  ThreadMessageRole,
  ThreadPermissionRequest,
  ThreadToolBlock,
} from '../types';
import type { CraftRpcConfig, EnsureSessionOptions, SessionRpcAdapter } from './types';
import { MockSessionRpcAdapter } from './mock-adapter';

/**
 * Craft WebSocket RPC adapter aligned with craft-agents protocol v1.
 * Falls back to mock when the server is unavailable.
 */
export class CraftSessionRpcAdapter implements SessionRpcAdapter {
  readonly mode = 'craft' as const;
  private ws: WebSocket | null = null;
  private connected = false;
  private fallback: MockSessionRpcAdapter;
  private useFallback = false;
  private connectError: string | null = null;
  private pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private eventHandlers = new Map<string, Set<(msg: ThreadMessage) => void>>();
  private streamBuffers = new Map<string, string>();
  private toolBlocks = new Map<string, Map<string, ThreadToolBlock>>();
  private seededSessions = new Set<string>();

  constructor(private config: CraftRpcConfig) {
    this.fallback = new MockSessionRpcAdapter();
  }

  async connect(): Promise<void> {
    try {
      await this.connectCraft();
      this.useFallback = false;
      this.connectError = null;
    } catch (e) {
      this.connectError =
        e instanceof Error ? e.message : 'Craft server unreachable';
      await this.fallback.connect();
      this.useFallback = true;
      this.connected = true;
    }
  }

  private connectCraft(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('RPC connect timeout')),
        10_000,
      );
      try {
        this.ws = new WebSocket(this.config.url);
      } catch (e) {
        clearTimeout(timeout);
        reject(e);
        return;
      }
      this.ws.onopen = () => {
        const handshake: CraftWireEnvelope = {
          id: uuid(),
          type: 'handshake',
          protocolVersion: CRAFT_PROTOCOL_VERSION,
          workspaceId: this.config.workspaceId,
          token: this.config.token,
        };
        this.ws!.send(JSON.stringify(handshake));
      };
      this.ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('WebSocket error'));
      };
      this.ws.onmessage = (ev) => {
        const handled = this.handleMessage(String(ev.data));
        if (handled === 'handshake_ack' && !this.connected) {
          clearTimeout(timeout);
          this.connected = true;
          this.subscribeSessionEvents();
          resolve();
        }
        if (handled === 'error' && !this.connected) {
          clearTimeout(timeout);
          reject(new Error('Handshake rejected'));
        }
      };
      this.ws.onclose = () => {
        this.connected = false;
      };
    });
  }

  private subscribeSessionEvents(): void {
    // Events arrive on session:event channel via envelope.type === 'event'
  }

  private invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not open'));
        return;
      }
      const id = uuid();
      const envelope: CraftWireEnvelope = {
        id,
        type: 'request',
        channel,
        args,
      };
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(envelope));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Request timeout: ${channel}`));
        }
      }, 30_000);
    });
  }

  private handleMessage(raw: string): 'handshake_ack' | 'error' | 'other' {
    let envelope: CraftWireEnvelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      return 'other';
    }

    if (envelope.type === 'response' && envelope.id) {
      const pending = this.pending.get(envelope.id);
      if (pending) {
        this.pending.delete(envelope.id);
        if (envelope.error) {
          pending.reject(new Error(envelope.error.message));
        } else {
          pending.resolve(envelope.result);
        }
      }
      return 'other';
    }

    if (envelope.type === 'handshake_ack') {
      return 'handshake_ack';
    }

    if (envelope.type === 'error') {
      return 'error';
    }

    if (
      envelope.type === 'event' &&
      envelope.channel === CRAFT_CHANNELS.sessions.EVENT
    ) {
      const event = (envelope.args?.[0] ?? envelope) as CraftSessionEvent;
      this.handleSessionEvent(event);
    }

    return 'other';
  }

  private handleSessionEvent(event: CraftSessionEvent): void {
    const sessionId = event.sessionId;
    if (!sessionId) return;

    if (event.type === 'tool_start' && event.toolUseId && event.toolName) {
      const tools = this.toolBlocksFor(sessionId);
      tools.set(event.toolUseId, {
        toolUseId: event.toolUseId,
        toolName: event.toolName,
        input: event.toolInput,
        status: 'running',
      });
      this.emitToolUpdate(sessionId);
      return;
    }

    if (event.type === 'tool_result' && event.toolUseId) {
      const tools = this.toolBlocksFor(sessionId);
      const existing = tools.get(event.toolUseId);
      tools.set(event.toolUseId, {
        toolUseId: event.toolUseId,
        toolName: event.toolName ?? existing?.toolName ?? 'tool',
        input: existing?.input,
        result: event.result,
        isError: event.isError,
        status: 'done',
      });
      this.emitToolUpdate(sessionId);
      return;
    }

    if (event.type === 'permission_request' && event.request) {
      const req = event.request;
      const permissionRequest: ThreadPermissionRequest = {
        requestId: String(req.requestId ?? req.id ?? uuid()),
        summary: String(
          req.description ?? req.summary ?? req.toolName ?? 'Permission required',
        ),
        toolName: req.toolName,
      };
      this.emit(sessionId, {
        id: `perm-${permissionRequest.requestId}`,
        sessionId,
        role: 'system',
        content: permissionRequest.summary,
        createdAt: new Date().toISOString(),
        meta: { permissionRequest },
      });
      return;
    }

    if (event.type === 'plan_submitted' && event.message) {
      const msg = craftMessageToThread({
        ...event.message,
        sessionId,
        role: 'assistant',
      });
      if (msg) this.emit(sessionId, msg);
      return;
    }

    if (event.type === 'text_delta' && event.delta) {
      const prev = this.streamBuffers.get(sessionId) ?? '';
      this.streamBuffers.set(sessionId, prev + event.delta);
      const streaming: ThreadMessage = {
        id: `stream-${sessionId}`,
        sessionId,
        role: 'assistant',
        content: prev + event.delta,
        createdAt: new Date().toISOString(),
        meta: { collapsedTools: true, streaming: true },
      };
      this.emit(sessionId, streaming);
      return;
    }

    if (event.type === 'text_complete' && event.text) {
      this.streamBuffers.delete(sessionId);
      const msg: ThreadMessage = {
        id: uuid(),
        sessionId,
        role: 'assistant',
        content: event.text,
        createdAt: new Date().toISOString(),
        meta: { collapsedTools: true },
      };
      this.emit(sessionId, msg);
      return;
    }

    if (event.type === 'complete') {
      const buffered = this.streamBuffers.get(sessionId);
      if (buffered) {
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
      return;
    }

    if (event.type === 'error' && event.error) {
      this.emit(sessionId, {
        id: uuid(),
        sessionId,
        role: 'system',
        content: `Agent error: ${event.error}`,
        createdAt: new Date().toISOString(),
      });
      return;
    }

    const msg = craftEventToMessage(event);
    if (msg) this.emit(sessionId, msg);
  }

  async disconnect(): Promise<void> {
    if (this.useFallback) return this.fallback.disconnect();
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.useFallback ? this.fallback.isConnected() : this.connected;
  }

  /** True when connected to Craft WebSocket (not mock fallback). */
  isCraftNative(): boolean {
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
    if (sessionId) return sessionId;

    const result = (await this.invoke(
      CRAFT_CHANNELS.sessions.CREATE,
      this.config.workspaceId,
      {
        name: options?.title ?? 'Liner point thread',
        hidden: false,
      },
    )) as { id?: string };

    const id = result?.id ?? uuid();

    if (options?.context && !this.seededSessions.has(id)) {
      this.seededSessions.add(id);
      try {
        await this.invoke(
          CRAFT_CHANNELS.sessions.SEND_MESSAGE,
          id,
          `[Liner context — not a user task]\n\n${options.context}`,
        );
      } catch {
        /* context seed is best-effort */
      }
    }

    return id;
  }

  async getMessages(sessionId: string): Promise<ThreadMessage[]> {
    if (this.useFallback) return this.fallback.getMessages(sessionId);
    try {
      const result = (await this.invoke(
        CRAFT_CHANNELS.sessions.GET_MESSAGES,
        sessionId,
      )) as { messages?: unknown[]; id?: string };
      const raw = result?.messages ?? (Array.isArray(result) ? result : []);
      return raw.map(craftMessageToThread).filter(Boolean) as ThreadMessage[];
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
    try {
      await this.invoke(
        CRAFT_CHANNELS.sessions.SEND_MESSAGE,
        sessionId,
        content,
      );
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
    await this.invoke(
      CRAFT_CHANNELS.sessions.RESPOND_TO_PERMISSION,
      sessionId,
      requestId,
      approved,
    );
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

function craftMessageToThread(raw: unknown): ThreadMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const role = mapRole(m.role as string | undefined);
  if (!role) return null;
  const content =
    typeof m.content === 'string'
      ? m.content
      : Array.isArray(m.content)
        ? (m.content as { text?: string }[])
            .map((p) => p.text ?? '')
            .join('')
        : String(m.text ?? '');
  return {
    id: String(m.id ?? uuid()),
    sessionId: String(m.sessionId ?? ''),
    role,
    content,
    createdAt: String(
      m.createdAt ?? new Date(m.lastMessageAt as number).toISOString(),
    ),
    meta: { collapsedTools: role === 'assistant' },
  };
}

function craftEventToMessage(event: CraftSessionEvent): ThreadMessage | null {
  if (event.message) {
    return craftMessageToThread({ ...event.message, sessionId: event.sessionId });
  }
  return null;
}

function mapRole(role?: string): ThreadMessageRole | null {
  if (role === 'user' || role === 'human') return 'user';
  if (role === 'assistant' || role === 'agent' || role === 'plan') return 'assistant';
  if (role === 'system') return 'system';
  return null;
}
