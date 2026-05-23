import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Cursor API key store at ~/.liner/auth.json */
export type CursorAuthEntry = { type: 'api'; key: string };

export type LinerAuthFile = {
  cursor?: CursorAuthEntry;
  [providerId: string]: CursorAuthEntry | Record<string, unknown> | undefined;
};

export const CURSOR_MODEL_LABEL = 'Composer 2.5';

export function linerAuthPath(): string {
  return join(homedir(), '.liner', 'auth.json');
}

export function readLinerAuth(): LinerAuthFile {
  const path = linerAuthPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as LinerAuthFile;
  } catch {
    return {};
  }
}

export function writeLinerAuth(next: LinerAuthFile): void {
  const path = linerAuthPath();
  mkdirSync(join(homedir(), '.liner'), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2) + '\n', 'utf8');
}

export function getCursorApiKey(): string | null {
  const entry = readLinerAuth().cursor;
  if (entry?.type === 'api' && typeof entry.key === 'string' && entry.key.trim()) {
    return entry.key.trim();
  }
  return null;
}

export function setCursorApiKey(apiKey: string): LinerAuthFile {
  const auth = readLinerAuth();
  const trimmed = apiKey.trim();
  if (!trimmed) {
    delete auth.cursor;
  } else {
    auth.cursor = { type: 'api', key: trimmed };
  }
  writeLinerAuth(auth);
  return auth;
}

export function hasCursorApiKey(): boolean {
  return Boolean(getCursorApiKey());
}
