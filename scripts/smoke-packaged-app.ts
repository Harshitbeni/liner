#!/usr/bin/env bun
/**
 * Smoke test for a running Liner API (packaged app or dev stack).
 *
 *   bun run smoke:packaged
 *   LINER_API_PORT=9240 bun run smoke:packaged
 */
const API_PORT = process.env.LINER_API_PORT ?? '9240';
const BASE = `http://127.0.0.1:${API_PORT}/api`;

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `${path} → ${res.status}: ${(body as { error?: string }).error ?? res.statusText}`,
    );
  }
  return body as T;
}

async function main(): Promise<void> {
  console.log(`[smoke:packaged] Probing ${BASE}…`);

  let health: {
    ok?: boolean;
    rpc?: string;
    craftReachable?: boolean;
    engine?: { state?: string; version?: string; error?: string | null };
    lastError?: string | null;
  };

  try {
    health = await fetchJson('/health');
  } catch (e) {
    console.error(
      `[smoke:packaged] API not reachable. Launch Liner.app or run \`bun run dev\` first.`,
    );
    console.error(String(e));
    process.exit(1);
  }

  console.log('[smoke:packaged] Health:', JSON.stringify(health, null, 2));

  if (!health.ok) {
    console.error('[smoke:packaged] Health not ok');
    process.exit(1);
  }

  const verify = await fetchJson<{
    exitCode: number;
    ok: boolean;
    message: string;
    rpcMode?: string;
  }>('/verify-craft', { method: 'POST' });

  console.log('[smoke:packaged] Verify:', JSON.stringify(verify, null, 2));

  if (health.engine?.packaged && health.engine.state === 'failed') {
    console.error('[smoke:packaged] Bundled engine failed:', health.engine.error);
    process.exit(1);
  }

  process.exit(verify.exitCode === 0 ? 0 : verify.exitCode === 2 ? 2 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
