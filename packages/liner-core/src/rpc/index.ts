import type { LinerSettings } from '../types';
import { isManagedEngineEnabled } from '../engine/supervisor';
import { isMockFallbackAllowed, isPackagedMode } from '../engine-info';
import { isOpencodeServerReachable } from './opencode-detect';
import { OpenCodeSessionRpcAdapter } from './opencode-adapter';
import { MockSessionRpcAdapter } from './mock-adapter';
import type { OpenCodeRpcConfig, RpcMode, SessionRpcAdapter } from './types';

export * from './types';
export { MockSessionRpcAdapter } from './mock-adapter';
export { OpenCodeSessionRpcAdapter } from './opencode-adapter';
export { isOpencodeServerReachable } from './opencode-detect';

export async function resolveRpcMode(
  settings: LinerSettings,
  preferred?: RpcMode,
): Promise<RpcMode> {
  if (preferred === 'mock') return 'mock';
  if (preferred === 'opencode') return 'opencode';
  const env = process.env.LINER_RPC_MODE as RpcMode | 'auto' | undefined;
  if (env === 'mock') return 'mock';
  if (env === 'opencode') return 'opencode';
  if (isPackagedMode()) return 'opencode';
  if (isManagedEngineEnabled()) return 'opencode';
  const reachable = await isOpencodeServerReachable(settings.opencodeBaseUrl);
  return reachable ? 'opencode' : 'mock';
}

export function createRpcAdapter(
  settings: LinerSettings,
  mode: RpcMode = 'opencode',
): SessionRpcAdapter {
  if (mode === 'mock') {
    return new MockSessionRpcAdapter();
  }
  const config: OpenCodeRpcConfig = {
    baseUrl: settings.opencodeBaseUrl,
  };
  return new OpenCodeSessionRpcAdapter(config, {
    allowMockFallback: isMockFallbackAllowed(),
  });
}

export async function createConnectedRpcAdapter(
  settings: LinerSettings,
  preferred?: RpcMode,
): Promise<SessionRpcAdapter> {
  const mode = await resolveRpcMode(settings, preferred);
  const adapter = createRpcAdapter(settings, mode);
  await adapter.connect();
  return adapter;
}
