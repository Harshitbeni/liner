/**
 * Verify OpenCode engine integration. Skips when ENGINE_SKIP=1.
 *
 *   bun run verify:engine
 */
if (process.env.ENGINE_SKIP === '1') {
  console.log('verify:engine skipped (ENGINE_SKIP=1)');
  process.exit(0);
}

const proc = Bun.spawn(['bun', 'scripts/engine-smoke.ts'], {
  stdout: 'inherit',
  stderr: 'inherit',
  cwd: import.meta.dir + '/..',
});
const code = await proc.exited;
process.exit(code);
