/**
 * Smoke test OpenCode RPC (mock or live).
 *
 *   bun run verify:engine
 */
import { createConnectedRpcAdapter } from '@liner/core';
import { OutlineStore } from '@liner/core';

const forceOpencode = process.env.LINER_RPC_MODE === 'opencode';
const baseUrl = process.env.OPENCODE_BASE_URL ?? 'http://127.0.0.1:4096';

async function main() {
  const store = new OutlineStore('engine-smoke');
  const settings = store.getSettings();
  settings.opencodeBaseUrl = baseUrl;

  const rpc = await createConnectedRpcAdapter(
    settings,
    forceOpencode ? 'opencode' : undefined,
  );

  if (forceOpencode && rpc.mode === 'mock') {
    console.error('verify:engine exit 2 — opencode unreachable');
    process.exit(2);
  }

  const sessionId = await rpc.ensureSession(null, { title: 'smoke' });
  await rpc.sendMessage(sessionId, 'Reply with exactly: LINER_SMOKE_OK');
  await new Promise((r) => setTimeout(r, rpc.mode === 'mock' ? 1500 : 8000));
  const messages = await rpc.getMessages(sessionId);
  await rpc.disconnect();

  if (rpc.mode === 'mock') {
    console.error('verify:engine exit 2 — mock only');
    process.exit(2);
  }

  if (!messages.some((m) => m.role === 'assistant')) {
    console.error('verify:engine exit 1 — no assistant reply');
    process.exit(1);
  }

  console.log('verify:engine OK');
  process.exit(0);
}

main().catch((e) => {
  console.error('verify:engine exit 1 —', e);
  process.exit(1);
});
