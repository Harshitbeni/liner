import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { dbPath, DEFAULT_WORKSPACE_ID, linerHome, workspaceDir } from './paths';
import { OutlineStore } from './store';

export type WorkspaceInfo = {
  id: string;
  path: string;
  isActive: boolean;
};

const WORKSPACE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export function isValidWorkspaceId(id: string): boolean {
  return WORKSPACE_ID_RE.test(id);
}

export function listWorkspaces(activeId?: string): WorkspaceInfo[] {
  const active = activeId ?? process.env.LINER_WORKSPACE_ID ?? DEFAULT_WORKSPACE_ID;
  const root = join(linerHome(), 'workspaces');
  const ids = new Set<string>();

  if (existsSync(root)) {
    for (const ent of readdirSync(root, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      if (existsSync(dbPath(ent.name))) ids.add(ent.name);
    }
  }

  if (!ids.has(DEFAULT_WORKSPACE_ID)) {
    if (existsSync(dbPath(DEFAULT_WORKSPACE_ID))) ids.add(DEFAULT_WORKSPACE_ID);
  }

  if (ids.size === 0) {
    return [
      {
        id: DEFAULT_WORKSPACE_ID,
        path: workspaceDir(DEFAULT_WORKSPACE_ID),
        isActive: active === DEFAULT_WORKSPACE_ID,
      },
    ];
  }

  return [...ids]
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({
      id,
      path: workspaceDir(id),
      isActive: id === active,
    }));
}

export function createWorkspace(id: string): WorkspaceInfo {
  if (!isValidWorkspaceId(id)) {
    throw new Error(
      'Workspace id must be 1–64 alphanumeric characters, hyphens, or underscores',
    );
  }
  mkdirSync(workspaceDir(id), { recursive: true });
  new OutlineStore(id);
  return {
    id,
    path: workspaceDir(id),
    isActive: false,
  };
}
