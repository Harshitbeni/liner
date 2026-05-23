import { describe, expect, test } from 'bun:test';
import { setCursorApiKey } from '../provider-auth';
import { OutlineStore } from '../store';
import { MockSessionRpcAdapter } from '../rpc/mock-adapter';
import {
  CursorSdkSessionRpcAdapter,
  CURSOR_DEFAULT_MODEL,
} from '../rpc/cursor-sdk-adapter';
import type { CursorSdkFacade } from '../rpc/cursor-sdk-facade';
import type { SDKAgent, Run, RunResult } from '@cursor/sdk';

function mockFacade(overrides?: Partial<CursorSdkFacade>): CursorSdkFacade {
  const agents = new Map<string, MockAgent>();

  return {
    verifyApiKey: async () => true,
    create: async () => {
      const agent = new MockAgent();
      agents.set(agent.agentId, agent);
      return agent;
    },
    resume: async (agentId) => {
      const existing = agents.get(agentId);
      if (existing) return existing;
      const agent = new MockAgent(agentId);
      agents.set(agentId, agent);
      return agent;
    },
    ...overrides,
  };
}

class MockAgent implements SDKAgent {
  readonly agentId: string;
  readonly model = { id: CURSOR_DEFAULT_MODEL };

  constructor(agentId?: string) {
    this.agentId = agentId ?? `agent-${Math.random().toString(36).slice(2)}`;
  }

  async send(message: string | { text: string }): Promise<Run> {
    const text = typeof message === 'string' ? message : message.text;
    return new MockRun(this.agentId, `Echo: ${text}`);
  }

  close(): void {}
  async reload(): Promise<void> {}
  async [Symbol.asyncDispose](): Promise<void> {}
  async listArtifacts() {
    return [];
  }
  async downloadArtifact(): Promise<Buffer> {
    return Buffer.from('');
  }
}

class MockRun implements Run {
  readonly id = 'run-1';
  readonly agentId: string;
  private readonly reply: string;
  readonly status = 'finished' as const;

  constructor(agentId: string, reply: string) {
    this.agentId = agentId;
    this.reply = reply;
  }

  supports(): boolean {
    return true;
  }
  unsupportedReason(): undefined {
    return undefined;
  }

  async *stream() {
    yield {
      type: 'assistant' as const,
      agent_id: this.agentId,
      run_id: this.id,
      message: {
        role: 'assistant' as const,
        content: [{ type: 'text' as const, text: this.reply }],
      },
    };
  }

  async conversation() {
    return [];
  }

  async wait(): Promise<RunResult> {
    return {
      id: this.id,
      status: 'finished',
      result: this.reply,
    };
  }

  async cancel(): Promise<void> {}
  onDidChangeStatus(): () => void {
    return () => {};
  }
}

describe('MockSessionRpcAdapter contract', () => {
  test('ensureSession creates session and sendMessage emits assistant reply', async () => {
    const rpc = new MockSessionRpcAdapter();
    await rpc.connect();

    const sessionId = await rpc.ensureSession(null, { title: 'contract test' });
    expect(sessionId).toBeTruthy();

    const events: string[] = [];
    const unsub = rpc.subscribe(sessionId, (msg) => {
      if (msg.role === 'assistant') events.push(msg.content);
    });

    await rpc.sendMessage(sessionId, 'hello');
    await new Promise((r) => setTimeout(r, 500));
    unsub();

    const messages = await rpc.getMessages(sessionId);
    expect(messages.some((m) => m.role === 'user' && m.content === 'hello')).toBe(
      true,
    );
    expect(
      events.length > 0 || messages.some((m) => m.role === 'assistant'),
    ).toBe(true);
    await rpc.disconnect();
  });
});

describe('CursorSdkSessionRpcAdapter contract', () => {
  test('streams and finalizes assistant reply with mocked SDK', async () => {
    setCursorApiKey('cursor_test_key');
    const store = new OutlineStore(`test-${Date.now()}`);
    const rpc = new CursorSdkSessionRpcAdapter({
      store,
      workspaceId: store.workspaceId,
      facade: mockFacade(),
      allowMockFallback: false,
    });
    await rpc.connect();

    const sessionId = await rpc.ensureSession(null, { title: 'cursor test' });
    const finals: string[] = [];
    const unsub = rpc.subscribe(sessionId, (msg) => {
      if (msg.role === 'assistant' && !msg.meta?.streaming) {
        finals.push(msg.content);
      }
    });

    await rpc.sendMessage(sessionId, 'hello');
    await new Promise((r) => setTimeout(r, 300));
    unsub();

    const messages = await rpc.getMessages(sessionId);
    expect(messages.some((m) => m.role === 'user' && m.content === 'hello')).toBe(
      true,
    );
    expect(
      finals.length > 0 || messages.some((m) => m.role === 'assistant'),
    ).toBe(true);
    await rpc.disconnect();
    setCursorApiKey('');
  });

  test('missing API key uses mock fallback when allowed', async () => {
    const prev = process.env.LINER_ALLOW_MOCK_FALLBACK;
    process.env.LINER_ALLOW_MOCK_FALLBACK = '1';
    const store = new OutlineStore(`test-fallback-${Date.now()}`);
    const rpc = new CursorSdkSessionRpcAdapter({
      store,
      workspaceId: store.workspaceId,
      facade: mockFacade({
        verifyApiKey: async () => {
          throw new Error('Cursor API key verification failed');
        },
      }),
      allowMockFallback: true,
    });
    await rpc.connect();
    expect(rpc.isSdkNative()).toBe(false);
    await rpc.disconnect();
    if (prev !== undefined) process.env.LINER_ALLOW_MOCK_FALLBACK = prev;
    else delete process.env.LINER_ALLOW_MOCK_FALLBACK;
  });
});

const cursorE2e = process.env.CURSOR_SDK_E2E === '1';

describe.skipIf(!cursorE2e)('Cursor SDK E2E (CURSOR_SDK_E2E=1)', () => {
  test('live local Composer 2.5 run', async () => {
    const store = new OutlineStore('e2e-verify');
    const rpc = new CursorSdkSessionRpcAdapter({
      store,
      workspaceId: store.workspaceId,
    });
    await rpc.connect();
    expect(rpc.isSdkNative()).toBe(true);
    const sessionId = await rpc.ensureSession(null, { title: 'e2e' });
    await rpc.sendMessage(sessionId, 'Reply with exactly: LINER_SMOKE_OK');
    await new Promise((r) => setTimeout(r, 60_000));
    const messages = await rpc.getMessages(sessionId);
    expect(messages.some((m) => m.role === 'assistant')).toBe(true);
    await rpc.disconnect();
  }, 120_000);
});
