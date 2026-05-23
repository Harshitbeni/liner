/** Cursor SDK runtime — no separate managed engine process. */
export type ManagedEngineResult = {
  state: 'dev' | 'ready' | 'unavailable';
  error: string | null;
  version: string | null;
  source: 'bundled' | 'dev' | 'none';
  started: boolean;
  reason?: string;
};

export type StartManagedEngineOptions = {
  isPackaged?: boolean;
  resourcesPath?: string;
  repoRoot?: string;
  engineRootOverride?: string;
  bunPath?: string | null;
  pipeStdio?: boolean;
  waitTimeoutMs?: number;
};

export function isManagedEngineEnabled(): boolean {
  return false;
}

export async function startManagedEngine(
  _opts: StartManagedEngineOptions = {},
): Promise<ManagedEngineResult> {
  return {
    state: 'dev',
    error: null,
    version: null,
    source: 'dev',
    started: false,
    reason: 'cursor-sdk',
  };
}

export function stopManagedEngine(): void {
  /* no-op */
}

export function applyEngineEnv(result: ManagedEngineResult): void {
  process.env.LINER_ENGINE_NAME = 'cursor-sdk';
  process.env.LINER_ENGINE_STATE = result.state;
  process.env.LINER_ENGINE_SOURCE = result.source;
  if (result.version) {
    process.env.LINER_ENGINE_VERSION = result.version;
  } else {
    delete process.env.LINER_ENGINE_VERSION;
  }
  if (result.error) {
    process.env.LINER_ENGINE_ERROR = result.error;
  } else {
    delete process.env.LINER_ENGINE_ERROR;
  }
}
