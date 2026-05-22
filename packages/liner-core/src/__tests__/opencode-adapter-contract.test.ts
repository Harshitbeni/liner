import { describe, expect, test } from 'bun:test';
import { MockSessionRpcAdapter } from '../rpc/mock-adapter';
import { OpenCodeSessionRpcAdapter } from '../rpc/opencode-adapter';

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

describe('OpenCodeSessionRpcAdapter fallback contract', () => {
  test(
    'unreachable OpenCode uses mock fallback with connect error recorded',
    async () => {
    const rpc = new OpenCodeSessionRpcAdapter(
      { baseUrl: 'http://127.0.0.1:59999' },
      { allowMockFallback: true },
    );
    await rpc.connect();

    expect(rpc.isConnected()).toBe(true);
    expect(rpc.isOpencodeNative()).toBe(false);
    expect(rpc.getLastError()).toBeTruthy();

    const sessionId = await rpc.ensureSession(null, { title: 'fallback' });
    await rpc.sendMessage(sessionId, 'ping');
    await new Promise((r) => setTimeout(r, 500));

    const messages = await rpc.getMessages(sessionId);
    expect(messages.some((m) => m.role === 'assistant')).toBe(true);
    await rpc.disconnect();
  });
});

const opencodeE2e = process.env.OPENCODE_E2E === '1';

describe.skipIf(!opencodeE2e)('OpenCode E2E (OPENCODE_E2E=1)', () => {
  test('live OpenCode HTTP accepts config probe', async () => {
    const baseUrl = process.env.OPENCODE_BASE_URL ?? 'http://127.0.0.1:4096';
    const { isOpencodeServerReachable } = await import('../rpc/opencode-detect');
    const ok = await isOpencodeServerReachable(baseUrl, 5_000);
    expect(ok).toBe(true);
  });
});
