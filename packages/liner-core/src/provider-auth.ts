import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** OpenCode-compatible auth store at ~/.liner/auth.json */
export type LinerAuthEntry =
  | { type: 'api'; key: string }
  | { type: 'oauth'; access: string; refresh?: string; expires?: number }
  | Record<string, unknown>;

export type LinerAuthFile = Record<string, LinerAuthEntry>;

export const PROVIDER_OPTIONS = [
  { id: 'anthropic', label: 'Anthropic', hint: 'Claude API key' },
  { id: 'openai', label: 'OpenAI', hint: 'OpenAI API key' },
  { id: 'openrouter', label: 'OpenRouter', hint: 'OpenRouter API key' },
  { id: 'google', label: 'Google AI', hint: 'Gemini API key' },
  { id: 'ollama', label: 'Ollama', hint: 'Local — no key required' },
] as const;

export type ProviderId = (typeof PROVIDER_OPTIONS)[number]['id'];

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

export function setProviderApiKey(
  providerId: string,
  apiKey: string,
): LinerAuthFile {
  const auth = readLinerAuth();
  const trimmed = apiKey.trim();
  if (!trimmed) {
    delete auth[providerId];
  } else {
    auth[providerId] = { type: 'api', key: trimmed };
  }
  writeLinerAuth(auth);
  return auth;
}

export function getConfiguredProviders(): string[] {
  return Object.keys(readLinerAuth()).filter((id) => {
    const entry = readLinerAuth()[id];
    return entry && typeof entry === 'object' && 'key' in entry && entry.key;
  });
}

export function hasProviderKey(providerId: string): boolean {
  const entry = readLinerAuth()[providerId];
  return Boolean(
    entry &&
      typeof entry === 'object' &&
      entry.type === 'api' &&
      typeof entry.key === 'string' &&
      entry.key.trim(),
  );
}
