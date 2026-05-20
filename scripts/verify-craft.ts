/**
 * Verify Craft RPC integration. Skips when CRAFT_SKIP=1.
 *
 *   bun run verify:craft
 *   CRAFT_SKIP=1 bun run verify:craft   # exit 0, skipped
 */
if (process.env.CRAFT_SKIP === '1') {
  console.log('verify:craft skipped (CRAFT_SKIP=1)');
  process.exit(0);
}

const proc = Bun.spawn(['bun', 'scripts/craft-smoke.ts'], {
  stdout: 'inherit',
  stderr: 'inherit',
  cwd: import.meta.dir + '/..',
});
const code = await proc.exited;
process.exit(code);
