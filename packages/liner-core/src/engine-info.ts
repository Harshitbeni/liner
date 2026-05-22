export type EngineState =
  | 'starting'
  | 'ready'
  | 'failed'
  | 'mock-fallback'
  | 'dev'
  | 'unavailable';

export type EngineInfo = {
  name: string;
  version: string | null;
  state: EngineState;
  source: 'bundled' | 'dev' | 'none';
  platform?: string;
  arch?: string;
  error: string | null;
  packaged: boolean;
};

export function getEngineInfo(): EngineInfo {
  const packaged = process.env.LINER_PACKAGED === '1';
  const state = (process.env.LINER_ENGINE_STATE as EngineState | undefined) ?? 'dev';
  const version = process.env.LINER_ENGINE_VERSION?.trim() || null;
  const error = process.env.LINER_ENGINE_ERROR?.trim() || null;
  const source =
    (process.env.LINER_ENGINE_SOURCE as EngineInfo['source'] | undefined) ??
    (packaged ? 'bundled' : 'dev');

  return {
    name: process.env.LINER_ENGINE_NAME?.trim() || 'opencode',
    version,
    state: packaged && !process.env.LINER_ENGINE_STATE ? 'starting' : state,
    source,
    platform: process.env.LINER_ENGINE_PLATFORM,
    arch: process.env.LINER_ENGINE_ARCH,
    error,
    packaged,
  };
}

/** Packaged builds should prefer OpenCode RPC and surface failures explicitly. */
export function isPackagedMode(): boolean {
  return process.env.LINER_PACKAGED === '1';
}

/** True when mock fallback to demo RPC is allowed (CI, explicit opt-in). */
export function isMockFallbackAllowed(): boolean {
  return process.env.LINER_ALLOW_MOCK_FALLBACK === '1';
}
