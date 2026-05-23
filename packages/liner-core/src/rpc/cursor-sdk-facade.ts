import {
  Agent,
  Cursor,
  type AgentOptions,
  type SDKAgent,
} from '@cursor/sdk';

export type CursorSdkFacade = {
  create(options: AgentOptions): Promise<SDKAgent>;
  resume(agentId: string, options?: Partial<AgentOptions>): Promise<SDKAgent>;
  verifyApiKey(apiKey: string): Promise<boolean>;
};

export const defaultCursorSdkFacade: CursorSdkFacade = {
  create: (options) => Agent.create(options),
  resume: (agentId, options) => Agent.resume(agentId, options),
  verifyApiKey: async (apiKey) => {
    await Cursor.me({ apiKey });
    return true;
  },
};
