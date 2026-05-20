import { describe, expect, test } from 'bun:test';
import { MockSessionRpcAdapter } from '../rpc/mock-adapter';
import { CraftSessionRpcAdapter } from '../rpc/craft-adapter';
import { isPackagedMode } from '../engine-info';

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
    expect(messages.some((m) => m.role === 'user' && m.content === 'hello')).toBe(true);
    expect(
      events.length > 0 || messages.some((m) => m.role === 'assistant'),
    ).toBe(true);
    await rpc.disconnect();
  });
});

describe('CraftSessionRpcAdapter fallback contract', () => {
  test('unreachable Craft uses mock fallback with connect error recorded', async () => {
    const rpc = new CraftSessionRpcAdapter({
      url: 'ws://127.0.0.1:59999',
      workspaceId: 'default',
    });
    await rpc.connect();

    expect(rpc.isConnected()).toBe(true);
    expect(rpc.isCraftNative()).toBe(false);
    expect(rpc.getLastError()).toBeTruthy();

    const sessionId = await rpc.ensureSession(null, { title: 'fallback' });
    await rpc.sendMessage(sessionId, 'ping');
    await new Promise((r) => setTimeout(r, 500));

    const messages = await rpc.getMessages(sessionId);
    expect(messages.some((m) => m.role === 'assistant')).toBe(true);
    await rpc.disconnect();
  });
});

describe('packaged mode policy', () => {
  test('isPackagedMode reads LINER_PACKAGED', () => {
    const prev = process.env.LINER_PACKAGED;
    process.env.LINER_PACKAGED = '1';
    expect(isPackagedMode()).toBe(true);
    delete process.env.LINER_PACKAGED;
    expect(isPackagedMode()).toBe(false);
    if (prev !== undefined) process.env.LINER_PACKAGED = prev;
  });
});

const craftE2e = process.env.CRAFT_E2E === '1';

describe.skipIf(!craftE2e)('Craft E2E (CRAFT_E2E=1)', () => {
  test('live Craft WebSocket accepts handshake', async () => {
    const url = process.env.CRAFT_RPC_URL ?? 'ws://127.0.0.1:9100';
    const { isCraftServerReachable } = await import('../rpc/detect');
    const ok = await isCraftServerReachable(url, 'default', 5_000);
    expect(ok).toBe(true);
  });
});
