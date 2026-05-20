import {
  CRAFT_CHANNELS,
  CRAFT_PROTOCOL_VERSION,
  type CraftWireEnvelope,
} from '../craft-protocol';

/** Probe whether a Craft RPC WebSocket server is reachable. */
export async function isCraftServerReachable(
  url: string,
  workspaceId = 'default',
  timeoutMs = 2500,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      finish(false);
      return;
    }

    const timer = setTimeout(() => finish(false), timeoutMs);

    ws.onopen = () => {
      const handshake: CraftWireEnvelope = {
        id: crypto.randomUUID(),
        type: 'handshake',
        protocolVersion: CRAFT_PROTOCOL_VERSION,
        workspaceId,
      };
      ws.send(JSON.stringify(handshake));
    };

    ws.onmessage = (ev) => {
      try {
        const envelope = JSON.parse(String(ev.data)) as CraftWireEnvelope;
        if (envelope.type === 'handshake_ack') {
          finish(true);
        }
      } catch {
        finish(false);
      }
    };

    ws.onerror = () => finish(false);
    ws.onclose = () => {
      if (!settled) finish(false);
    };
  });
}

export { CRAFT_CHANNELS };
