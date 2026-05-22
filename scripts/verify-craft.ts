/** @deprecated Use verify:engine — forwards for legacy scripts */
const proc = Bun.spawn(['bun', 'scripts/verify-engine.ts'], {
  stdout: 'inherit',
  stderr: 'inherit',
  cwd: import.meta.dir + '/..',
});
process.exit(await proc.exited);
