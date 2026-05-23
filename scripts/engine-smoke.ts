/**
 * Smoke test Cursor SDK RPC (mock or live).
 */
import { verifyEngineConnection } from '@liner/core';

const result = await verifyEngineConnection({
  forceCursorSdk: process.env.LINER_RPC_MODE === 'cursor-sdk',
  skip: process.env.ENGINE_SKIP === '1',
});

if (result.skipped) {
  console.log(result.message);
  process.exit(0);
}

if (result.ok) {
  console.log('verify:engine OK —', result.message);
  process.exit(0);
}

console.error(`verify:engine exit ${result.exitCode} —`, result.message);
process.exit(result.exitCode);
