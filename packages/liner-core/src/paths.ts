import { homedir } from 'node:os';
import { join } from 'node:path';

export function linerHome(): string {
  return join(homedir(), '.liner');
}

export function workspaceDir(workspaceId: string): string {
  return join(linerHome(), 'workspaces', workspaceId);
}

export function dbPath(workspaceId: string): string {
  return join(workspaceDir(workspaceId), 'liner.db');
}

export const DEFAULT_WORKSPACE_ID = 'default';
