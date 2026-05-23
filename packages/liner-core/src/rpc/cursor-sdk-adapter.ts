import { v4 as uuid } from 'uuid';
import {
  CursorAgentError,
  type SDKAgent,
  type SDKAssistantMessage,
  type SDKMessage,
  type SDKToolUseMessage,
} from '@cursor/sdk';
import type {
  ThreadMessage,
  ThreadPermissionRequest,
  ThreadToolBlock,
} from '../types';
import { isMockFallbackAllowed } from '../engine-info';
import { getCursorApiKey, hasCursorApiKey } from '../provider-auth';
import type { OutlineStore } from '../store';
import { CURSOR_DEFAULT_MODEL, cursorAgentOptions } from './cursor-config';
import {
  defaultCursorSdkFacade,
  type CursorSdkFacade,
} from './cursor-sdk-facade';
import { MockSessionRpcAdapter } from './mock-adapter';
import type { EnsureSessionOptions, SessionRpcAdapter } from './types';

type ImagePartMeta = { url: string; mime?: string; filename?: string };

export type CursorSdkAdapterOptions = {
  store: OutlineStore;
  workspaceId: string;
  facade?: CursorSdkFacade;
  allowMockFallback?: boolean;
};

/**
 * Local Cursor SDK adapter — maps point.sessionId ↔ Cursor agent id.
 */
export class CursorSdkSessionRpcAdapter implements SessionRpcAdapter {
  readonly mode = 'cursor-sdk' as const;
  private connected = false;
  private useFallback = false;
  private connectError: string | null = null;
  private readonly facade: CursorSdkFacade;
  private readonly fallback: MockSessionRpcAdapter;
  private readonly agents = new Map<string, SDKAgent>();
  private readonly eventHandlers = new Map<string, Set<(msg: ThreadMessage) => void>>();
  private readonly streamBuffers = new Map<string, string>();
  private readonly toolBlocks = new Map<string, Map<string, ThreadToolBlock>>();
  private readonly seededSessions = new Set<string>();
  private readonly activeRuns = new Map<string, Promise<void>>();

  constructor(
    private readonly options: CursorSdkAdapterOptions,
  ) {
    this.facade = options.facade ?? defaultCursorSdkFacade;
    this.fallback = new MockSessionRpcAdapter();
  }

  private allowMockFallback(): boolean {
    return (
      this.options.allowMockFallback === true || isMockFallbackAllowed()
    );
  }

  async connect(): Promise<void> {
    if (!hasCursorApiKey()) {
      this.connectError = 'Cursor API key not configured';
      if (!this.allowMockFallback()) {
        this.useFallback = false;
        this.connected = false;
        throw new Error(this.connectError);
      }
      await this.fallback.connect();
      this.useFallback = true;
      this.connected = true;
      return;
    }

    try {
      const apiKey = getCursorApiKey();
      if (!apiKey) throw new Error('Cursor API key not configured');
      await this.facade.verifyApiKey(apiKey);
      this.useFallback = false;
      this.connectError = null;
      this.connected = true;
    } catch (e) {
      this.connectError = formatCursorSdkError(e);
      if (!this.allowMockFallback()) {
        this.useFallback = false;
        this.connected = false;
        throw new Error(this.connectError);
      }
      await this.fallback.connect();
      this.useFallback = true;
      this.connected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.useFallback) return this.fallback.disconnect();
    for (const agent of this.agents.values()) {
      try {
        await agent[Symbol.asyncDispose]?.();
      } catch {
        agent.close();
      }
    }
    this.agents.clear();
    this.activeRuns.clear();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.useFallback ? this.fallback.isConnected() : this.connected;
  }

  isSdkNative(): boolean {
    return !this.useFallback && this.connected;
  }

  getLastError(): string | null {
    return this.connectError;
  }

  /** Wait for in-flight agent.run for this session (verify / harness). */
  async waitForSessionIdle(
    sessionId: string,
    timeoutMs = 60_000,
  ): Promise<void> {
    if (this.useFallback) return;
    const run = this.activeRuns.get(sessionId);
    if (!run) return;
    await Promise.race([
      run.catch(() => {}),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Agent run timed out')), timeoutMs),
      ),
    ]);
  }

  async ensureSession(
    sessionId: string | null,
    options?: EnsureSessionOptions,
  ): Promise<string> {
    if (this.useFallback) {
      return this.fallback.ensureSession(sessionId, options);
    }

    const agentId = await this.ensureAgent(sessionId);

    if (options?.context && !this.seededSessions.has(agentId)) {
      this.seededSessions.add(agentId);
      const contextMsg: ThreadMessage = {
        id: uuid(),
        sessionId: agentId,
        role: 'system',
        content: options.context,
        createdAt: new Date().toISOString(),
        meta: { collapsedTools: true },
      };
      this.persistAndEmit(contextMsg);
      void this.executeRun(
        agentId,
        `[Liner context — not a user task]\n\n${options.context}`,
        undefined,
        { skipUserPersist: true },
      ).catch(() => {});
    }

    return agentId;
  }

  async getMessages(sessionId: string): Promise<ThreadMessage[]> {
    if (this.useFallback) return this.fallback.getMessages(sessionId);
    return this.options.store.listThreadMessages(sessionId);
  }

  async sendMessage(
    sessionId: string,
    content: string,
    meta?: ThreadMessage['meta'],
  ): Promise<ThreadMessage> {
    if (this.useFallback) {
      return this.fallback.sendMessage(sessionId, content, meta);
    }

    const agentId = await this.ensureAgent(sessionId);
    const userMsg: ThreadMessage = {
      id: uuid(),
      sessionId: agentId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
      meta,
    };
    this.persistAndEmit(userMsg);

    const runPromise = this.executeRun(agentId, content, meta);
    this.activeRuns.set(agentId, runPromise);
    void runPromise.finally(() => {
      if (this.activeRuns.get(agentId) === runPromise) {
        this.activeRuns.delete(agentId);
      }
    });

    return userMsg;
  }

  async respondToPermission(
    sessionId: string,
    requestId: string,
    approved: boolean,
  ): Promise<void> {
    if (this.useFallback) return;
    const summary = approved ? 'Approved' : 'Denied';
    const msg: ThreadMessage = {
      id: uuid(),
      sessionId,
      role: 'system',
      content: `Permission ${summary.toLowerCase()} (${requestId})`,
      createdAt: new Date().toISOString(),
      meta: { collapsedTools: true },
    };
    this.persistAndEmit(msg);
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

  private async ensureAgent(sessionId: string | null): Promise<string> {
    if (sessionId && this.agents.has(sessionId)) {
      return sessionId;
    }

    if (sessionId) {
      try {
        const agent = await this.facade.resume(
          sessionId,
          cursorAgentOptions(this.options.workspaceId),
        );
        this.agents.set(sessionId, agent);
        return sessionId;
      } catch {
        /* create fresh agent */
      }
    }

    const agent = await this.facade.create(
      cursorAgentOptions(this.options.workspaceId),
    );
    this.agents.set(agent.agentId, agent);
    return agent.agentId;
  }

  private async executeRun(
    sessionId: string,
    prompt: string,
    meta?: ThreadMessage['meta'],
    opts?: { skipUserPersist?: boolean },
  ): Promise<void> {
    const agent = this.agents.get(sessionId);
    if (!agent) return;

    const text = buildPrompt(prompt, meta);
    let run;
    try {
      run = await agent.send(text);
    } catch (e) {
      const message =
        e instanceof CursorAgentError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Cursor agent send failed';
      this.emitError(sessionId, message);
      return;
    }

    try {
      for await (const event of run.stream()) {
        this.handleStreamEvent(sessionId, event);
      }
      const result = await run.wait();
      if (result.status === 'error') {
        this.emitError(sessionId, result.result ?? 'Agent run failed');
        return;
      }
      const finalText =
        result.result?.trim() ||
        this.streamBuffers.get(sessionId)?.trim() ||
        '';
      this.finalizeStream(sessionId, finalText);
    } catch (e) {
      const message =
        e instanceof CursorAgentError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Cursor agent run failed';
      this.emitError(sessionId, message);
    } finally {
      if (!opts?.skipUserPersist) {
        this.streamBuffers.delete(sessionId);
      }
    }
  }

  private handleStreamEvent(sessionId: string, event: SDKMessage): void {
    switch (event.type) {
      case 'assistant':
        this.handleAssistant(sessionId, event);
        break;
      case 'tool_call':
        this.handleToolCall(sessionId, event);
        break;
      case 'request':
        this.handlePermissionRequest(sessionId, event.request_id);
        break;
      default:
        break;
    }
  }

  private handleAssistant(sessionId: string, event: SDKAssistantMessage): void {
    const text = extractAssistantText(event);
    if (!text) return;
    this.streamBuffers.set(sessionId, text);
    this.emit(sessionId, {
      id: `stream-${sessionId}`,
      sessionId,
      role: 'assistant',
      content: text,
      createdAt: new Date().toISOString(),
      meta: { collapsedTools: true, streaming: true },
    });
  }

  private handleToolCall(sessionId: string, event: SDKToolUseMessage): void {
    const tools = this.toolBlocksFor(sessionId);
    const status: ThreadToolBlock['status'] =
      event.status === 'running' ? 'running' : 'done';
    tools.set(event.call_id, {
      toolUseId: event.call_id,
      toolName: event.name,
      input:
        event.args && typeof event.args === 'object'
          ? (event.args as Record<string, unknown>)
          : undefined,
      result:
        event.result != null ? String(event.result) : undefined,
      isError: event.status === 'error',
      status,
    });
    this.emitToolUpdate(sessionId);
  }

  private handlePermissionRequest(sessionId: string, requestId: string): void {
    const permissionRequest: ThreadPermissionRequest = {
      requestId,
      summary: 'Permission required',
    };
    this.persistAndEmit({
      id: `perm-${requestId}`,
      sessionId,
      role: 'system',
      content: permissionRequest.summary,
      createdAt: new Date().toISOString(),
      meta: { permissionRequest },
    });
  }

  private emitError(sessionId: string, message: string): void {
    this.finalizeStream(sessionId, `_Agent error: ${message}_`);
  }

  private finalizeStream(sessionId: string, content: string): void {
    this.streamBuffers.delete(sessionId);
    const msg: ThreadMessage = {
      id: uuid(),
      sessionId,
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
      meta: { collapsedTools: true },
    };
    this.persistAndEmit(msg);
  }

  private persistAndEmit(msg: ThreadMessage): void {
    this.options.store.appendThreadMessage(msg);
    this.emit(msg.sessionId, msg);
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

function extractAssistantText(event: SDKAssistantMessage): string {
  return event.message.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

function buildPrompt(
  content: string,
  meta?: ThreadMessage['meta'],
): string {
  const images = (meta as { images?: ImagePartMeta[] } | undefined)?.images;
  if (!images?.length) return content;
  const lines = images.map(
    (img, i) => `- Image ${i + 1}: ${img.url} (${img.mime ?? 'image/png'})`,
  );
  return `${content}\n\n[Attached images]\n${lines.join('\n')}`;
}

function formatCursorSdkError(e: unknown): string {
  if (e instanceof CursorAgentError) {
    const parts = [e.message];
    if (e.status) parts.push(`HTTP ${e.status}`);
    if (e.code) parts.push(String(e.code));
    return parts.filter(Boolean).join(' — ');
  }
  if (e instanceof Error) return e.message;
  return 'Cursor SDK connection failed';
}

export { CURSOR_DEFAULT_MODEL };
