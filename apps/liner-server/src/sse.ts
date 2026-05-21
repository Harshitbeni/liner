import type { PointState, ThreadMessage } from '@liner/core';

type SseWriter = (chunk: string) => void;

const listenersByPoint = new Map<string, Set<SseWriter>>();
const sessionUnsubs = new Map<string, () => void>();

let touchPointOnMessage: ((pointId: string, message: ThreadMessage) => void) | null =
  null;

export function configurePointActivity(
  handler: (pointId: string, message: ThreadMessage) => void,
): void {
  touchPointOnMessage = handler;
}

export function subscribePointSse(
  pointId: string,
  write: SseWriter,
): () => void {
  if (!listenersByPoint.has(pointId)) {
    listenersByPoint.set(pointId, new Set());
  }
  listenersByPoint.get(pointId)!.add(write);
  return () => {
    listenersByPoint.get(pointId)?.delete(write);
    if (listenersByPoint.get(pointId)?.size === 0) {
      listenersByPoint.delete(pointId);
    }
  };
}

export function broadcastPointMessage(
  pointId: string,
  message: ThreadMessage,
): void {
  if (touchPointOnMessage && message.meta?.streaming !== true) {
    touchPointOnMessage(pointId, message);
  }
  const payload = `data: ${JSON.stringify({ type: 'message', message })}\n\n`;
  for (const write of listenersByPoint.get(pointId) ?? []) {
    try {
      write(payload);
    } catch {
      /* client disconnected */
    }
  }
}

export function broadcastStateChange(
  pointId: string,
  from: PointState,
  to: PointState,
  actor: 'human' | 'agent' | 'harness',
): void {
  const payload = `data: ${JSON.stringify({ type: 'state_change', from, to, actor })}\n\n`;
  for (const write of listenersByPoint.get(pointId) ?? []) {
    try {
      write(payload);
    } catch {
      /* client disconnected */
    }
  }
}

export function broadcastAgentStatus(pointId: string, running: boolean): void {
  const payload = `data: ${JSON.stringify({ type: 'agent_status', running })}\n\n`;
  for (const write of listenersByPoint.get(pointId) ?? []) {
    try {
      write(payload);
    } catch {
      /* client disconnected */
    }
  }
}

export function broadcastPointPing(pointId: string): void {
  const payload = `: ping\n\n`;
  for (const write of listenersByPoint.get(pointId) ?? []) {
    try {
      write(payload);
    } catch {
      /* ignore */
    }
  }
}

export function ensureSessionBridge(
  pointId: string,
  sessionId: string,
  subscribe: (
    sessionId: string,
    onMessage: (msg: ThreadMessage) => void,
  ) => () => void,
): void {
  if (sessionUnsubs.has(pointId)) return;
  const unsub = subscribe(sessionId, (msg) => {
    broadcastPointMessage(pointId, msg);
  });
  sessionUnsubs.set(pointId, unsub);
}

export function clearSessionBridge(pointId: string): void {
  sessionUnsubs.get(pointId)?.();
  sessionUnsubs.delete(pointId);
}
