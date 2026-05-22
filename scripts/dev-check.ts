#!/usr/bin/env bun
/**
 * Quick sanity check after `bun run dev` — engine managed and RPC healthy.
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

  if (health.rpc === 'mock') {
    issues.push('RPC mode is mock (expected opencode for managed dev)');
  }
  const reachable = health.engineReachable;
  if (!reachable) {
    issues.push('OpenCode engine not reachable');
  }
  if (state !== 'ready') {
    issues.push(`engine.state is "${state ?? 'unknown'}" (expected ready)`);
  }

  if (issues.length > 0) {
    console.error('[dev:check] Failed:');
    for (const msg of issues) console.error(`  - ${msg}`);
    if (health.engine?.error) console.error(`  Engine: ${health.engine.error}`);
    if (health.lastError) console.error(`  Last: ${health.lastError}`);
    process.exit(1);
  }

  console.log('[dev:check] OK — OpenCode reachable, engine ready');
}

void main();
