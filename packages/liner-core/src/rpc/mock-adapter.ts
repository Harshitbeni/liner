import { v4 as uuid } from 'uuid';
import type { ThreadMessage } from '../types';
import type { EnsureSessionOptions, SessionRpcAdapter } from './types';

export class MockSessionRpcAdapter implements SessionRpcAdapter {
  readonly mode = 'mock' as const;
  private connected = false;
  private sessions = new Map<string, ThreadMessage[]>();
  private listeners = new Map<string, Set<(msg: ThreadMessage) => void>>();

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async ensureSession(
    sessionId: string | null,
    options?: EnsureSessionOptions,
  ): Promise<string> {
    if (sessionId && this.sessions.has(sessionId)) {
      return sessionId;
    }
    const id = sessionId ?? uuid();
    if (!this.sessions.has(id)) {
      this.sessions.set(id, []);
      if (options?.context) {
        const ctxMsg: ThreadMessage = {
          id: uuid(),
          sessionId: id,
          role: 'system',
          content: options.context,
          createdAt: new Date().toISOString(),
          meta: { collapsedTools: true },
        };
        this.sessions.get(id)!.push(ctxMsg);
      }
    }
    return id;
  }

  async getMessages(sessionId: string): Promise<ThreadMessage[]> {
    return [...(this.sessions.get(sessionId) ?? [])];
  }

  async sendMessage(
    sessionId: string,
    content: string,
    meta?: ThreadMessage['meta'],
  ): Promise<ThreadMessage> {
    const msg: ThreadMessage = {
      id: uuid(),
      sessionId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
      meta,
    };
    const list = this.sessions.get(sessionId) ?? [];
    list.push(msg);
    this.sessions.set(sessionId, list);
    this.emit(sessionId, msg);

    setTimeout(() => {
      const reply: ThreadMessage = {
        id: uuid(),
        sessionId,
        role: 'assistant',
        content:
          '_Mock agent reply._ Configure Cursor API key or set LINER_RPC_MODE=cursor-sdk for live sessions.',
        createdAt: new Date().toISOString(),
        meta: { collapsedTools: true },
      };
      list.push(reply);
      this.emit(sessionId, reply);
    }, 400);

    return msg;
  }

  async respondToPermission(
    _sessionId: string,
    _requestId: string,
    _approved: boolean,
  ): Promise<void> {
    /* mock has no permission gate */
  }

  subscribe(
    sessionId: string,
    onMessage: (msg: ThreadMessage) => void,
  ): () => void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set());
    }
    this.listeners.get(sessionId)!.add(onMessage);
    return () => this.listeners.get(sessionId)?.delete(onMessage);
  }

  private emit(sessionId: string, msg: ThreadMessage): void {
    for (const fn of this.listeners.get(sessionId) ?? []) {
      fn(msg);
    }
  }
}
