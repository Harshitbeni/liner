#!/usr/bin/env bun
/**
 * Quick sanity check after `bun run dev` — Cursor SDK config and RPC healthy.
 */
const apiPort = process.env.LINER_API_PORT ?? '9240';
const base = `http://127.0.0.1:${apiPort}/api`;

async function main(): Promise<void> {
  let health: {
    ok?: boolean;
    rpc?: string;
    engineReachable?: boolean;
    engine?: { state?: string; error?: string | null };
    lastError?: string | null;
  };

  try {
    const res = await fetch(`${base}/health`);
    health = (await res.json()) as typeof health;
  } catch (e) {
    console.error(`[dev:check] Cannot reach ${base}/health — is \`bun run dev\` running?`);
    console.error(e);
    process.exit(1);
  }

  if (!health.ok) {
    console.error('[dev:check] Health returned not ok');
    process.exit(1);
  }

  const state = health.engine?.state;
  const issues: string[] = [];

  if (process.env.LINER_EXPECT_MOCK !== '1' && health.rpc === 'mock') {
    issues.push('RPC mode is mock (set CURSOR_API_KEY for live SDK)');
  }
  if (process.env.LINER_EXPECT_MOCK !== '1' && !health.engineReachable) {
    issues.push('Cursor SDK not ready (API key missing or invalid)');
  }
  if (
    process.env.LINER_EXPECT_MOCK !== '1' &&
    state !== 'ready' &&
    state !== 'dev'
  ) {
    issues.push(`engine.state is "${state ?? 'unknown'}" (expected ready or dev)`);
  }

  if (issues.length > 0) {
    console.error('[dev:check] Failed:');
    for (const msg of issues) console.error(`  - ${msg}`);
    if (health.engine?.error) console.error(`  Engine: ${health.engine.error}`);
    if (health.lastError) console.error(`  Last: ${health.lastError}`);
    process.exit(1);
  }

  console.log('[dev:check] OK — health reachable, Cursor SDK configured');
}

void main();
