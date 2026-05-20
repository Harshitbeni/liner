/** Craft WS RPC channel names (mirrors @craft-agent/shared/protocol). */
export const CRAFT_CHANNELS = {
  sessions: {
    CREATE: 'sessions:create',
    GET_MESSAGES: 'sessions:getMessages',
    SEND_MESSAGE: 'sessions:sendMessage',
    RESPOND_TO_PERMISSION: 'sessions:respondToPermission',
    EVENT: 'session:event',
  },
} as const;

export const CRAFT_PROTOCOL_VERSION = '1.0';

export type CraftWireEnvelope = {
  id: string;
  type:
    | 'handshake'
    | 'handshake_ack'
    | 'request'
    | 'response'
    | 'event'
    | 'error';
  channel?: string;
  args?: unknown[];
  result?: unknown;
  error?: { code: string; message: string };
  protocolVersion?: string;
  workspaceId?: string;
  token?: string;
  clientId?: string;
};

export type CraftSessionEvent = {
  type: string;
  sessionId: string;
  delta?: string;
  text?: string;
  toolName?: string;
  toolUseId?: string;
  toolInput?: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  request?: {
    id?: string;
    requestId?: string;
    toolName?: string;
    description?: string;
    summary?: string;
  };
  message?: {
    id?: string;
    role?: string;
    content?: string | unknown[];
    text?: string;
  };
  error?: string;
};
