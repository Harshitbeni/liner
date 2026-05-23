import type { AgentOptions } from '@cursor/sdk';
import { workspaceDir } from '../paths';
import { getCursorApiKey } from '../provider-auth';

export const CURSOR_DEFAULT_MODEL = 'composer-2.5';

export function cursorAgentOptions(
  workspaceId: string,
  partial?: Partial<AgentOptions>,
): AgentOptions {
  const apiKey = getCursorApiKey();
  if (!apiKey) {
    throw new Error('Cursor API key not configured');
  }
  return {
    apiKey,
    model: { id: CURSOR_DEFAULT_MODEL },
    local: {
      cwd: workspaceDir(workspaceId),
      settingSources: [],
    },
    ...partial,
  };
}
