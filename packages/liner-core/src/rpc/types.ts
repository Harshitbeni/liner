import type { ThreadMessage } from '../types';

export type RpcMode = 'cursor-sdk' | 'mock';

export type EnsureSessionOptions = {
  title?: string;
  context?: string;
};

export interface SessionRpcAdapter {
  readonly mode: RpcMode;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  ensureSession(
    sessionId: string | null,
    options?: EnsureSessionOptions,
  ): Promise<string>;
  getMessages(sessionId: string): Promise<ThreadMessage[]>;
  sendMessage(
    sessionId: string,
    content: string,
    meta?: ThreadMessage['meta'],
  ): Promise<ThreadMessage>;
  subscribe(
    sessionId: string,
    onMessage: (msg: ThreadMessage) => void,
  ): () => void;
  respondToPermission?(
    sessionId: string,
    requestId: string,
    approved: boolean,
  ): Promise<void>;
}

