import { createOpencodeClient } from '@opencode-ai/sdk';

/** Probe whether an OpenCode HTTP server is reachable. */
export async function isOpencodeServerReachable(
  baseUrl: string,
  timeoutMs = 2500,
): Promise<boolean> {
  const client = createOpencodeClient({ baseUrl });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await client.config.get();
      if (res.data) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
