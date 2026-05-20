import type { LinerSettings } from '../types';
import { isPackagedMode } from '../engine-info';
import { isCraftServerReachable } from './detect';
import { CraftSessionRpcAdapter } from './craft-adapter';
import { MockSessionRpcAdapter } from './mock-adapter';
import type { CraftRpcConfig, RpcMode, SessionRpcAdapter } from './types';

export * from './types';
export { MockSessionRpcAdapter } from './mock-adapter';
export { CraftSessionRpcAdapter } from './craft-adapter';
export { isCraftServerReachable } from './detect';

export async function resolveRpcMode(
  settings: LinerSettings,
  preferred?: RpcMode,
): Promise<RpcMode> {
  if (preferred === 'mock') return 'mock';
  if (preferred === 'craft') return 'craft';
  const env = process.env.LINER_RPC_MODE as RpcMode | 'auto' | undefined;
  if (env === 'mock') return 'mock';
  if (env === 'craft') return 'craft';
  if (isPackagedMode()) return 'craft';
  const reachable = await isCraftServerReachable(
    settings.craftRpcUrl,
    settings.craftWorkspaceId,
  );
  return reachable ? 'craft' : 'mock';
}

export function createRpcAdapter(
  settings: LinerSettings,
  mode: RpcMode = 'craft',
): SessionRpcAdapter {
  if (mode === 'mock') {
    return new MockSessionRpcAdapter();
  }
  const config: CraftRpcConfig = {
    url: settings.craftRpcUrl,
    workspaceId: settings.craftWorkspaceId,
    token: process.env.CRAFT_SERVER_TOKEN,
  };
  return new CraftSessionRpcAdapter(config);
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
