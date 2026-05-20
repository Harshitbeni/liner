/**
 * Smoke test: Craft RPC reachable + Liner can create session and send a message.
 *
 * Usage:
 *   bun run craft:server   # terminal 1
 *   bun run craft:smoke    # terminal 2
 *
 * Exit codes:
 *   0 — success (connected to Craft or mock fallback with session)
 *   1 — unexpected failure
 *   2 — Craft unreachable and mock-only fallback (deps/server not running)
 */
import { verifyCraftConnection } from '@liner/core';

const url = process.env.CRAFT_RPC_URL ?? 'ws://127.0.0.1:9100';
const forceCraft = process.env.LINER_RPC_MODE === 'craft';

async function main() {
  console.log(`Connecting to ${url}…`);
  const result = await verifyCraftConnection({
    craftRpcUrl: url,
    forceCraft,
  });

  if (result.rpcMode) {
    console.log(`RPC mode: ${result.rpcMode}`);
  }
  console.log(result.message);

  if (result.ok && result.exitCode === 0) {
    console.log('craft:smoke OK');
  } else if (result.exitCode === 2) {
    console.warn(result.message);
  } else if (!result.ok) {
    console.error(result.message);
  }

  process.exit(result.exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
