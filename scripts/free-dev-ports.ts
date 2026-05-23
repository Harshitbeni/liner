#!/usr/bin/env bun
/** Kill stale Liner dev processes on API/UI ports (macOS/Linux). */
const ports = [
  Number(process.env.LINER_API_PORT ?? 9240),
  Number(process.env.OPENCODE_PORT ?? 4096),
  Number(process.env.LINER_UI_PORT ?? 5180),
];

for (const pattern of ['bun --watch src/index.ts', 'liner-server']) {
  const result = Bun.spawnSync(['pgrep', '-f', pattern]);
  const pids = new TextDecoder()
    .decode(result.stdout)
    .trim()
    .split('\n')
    .filter(Boolean);
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM');
      console.log(`[liner] stopped ${pattern} (pid ${pid})`);
    } catch {
      /* already gone */
    }
  }
}

for (const port of ports) {
  const result = Bun.spawnSync(['lsof', '-ti', `:${port}`]);
  const pids = new TextDecoder()
    .decode(result.stdout)
    .trim()
    .split('\n')
    .filter(Boolean);
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM');
      console.log(`[liner] freed port ${port} (pid ${pid})`);
    } catch {
      /* already gone */
    }
  }
}
