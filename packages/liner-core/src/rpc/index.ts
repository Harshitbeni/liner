import type { LinerSettings } from '../types';
import { OutlineStore } from '../store';
import type { OutlineStore as OutlineStoreType } from '../store';
import { isMockFallbackAllowed, isPackagedMode } from '../engine-info';
import { hasCursorApiKey } from '../provider-auth';
import { CursorSdkSessionRpcAdapter } from './cursor-sdk-adapter';
import { MockSessionRpcAdapter } from './mock-adapter';
import type { RpcMode, SessionRpcAdapter } from './types';

export * from './types';
export { MockSessionRpcAdapter } from './mock-adapter';
export {
  CursorSdkSessionRpcAdapter,
  CURSOR_DEFAULT_MODEL,
} from './cursor-sdk-adapter';
export { CURSOR_DEFAULT_MODEL as CURSOR_MODEL_ID } from './cursor-config';
export { defaultCursorSdkFacade, type CursorSdkFacade } from './cursor-sdk-facade';

export async function resolveRpcMode(
  _settings: LinerSettings,
  preferred?: RpcMode,
): Promise<RpcMode> {
  if (preferred === 'mock' && !hasCursorApiKey()) return 'mock';
  if (preferred === 'cursor-sdk' || (preferred === 'mock' && hasCursorApiKey())) {
    return 'cursor-sdk';
  }
  const env = process.env.LINER_RPC_MODE as RpcMode | 'auto' | undefined;
  if (env === 'mock' && !hasCursorApiKey()) return 'mock';
  if (env === 'cursor-sdk') return 'cursor-sdk';
  if (isPackagedMode()) return 'cursor-sdk';
  if (!hasCursorApiKey() && isMockFallbackAllowed()) return 'mock';
  if (!hasCursorApiKey() && process.env.LINER_RPC_MODE !== 'cursor-sdk') {
    return 'mock';
  }
  return 'cursor-sdk';
}

export function createRpcAdapter(
  settings: LinerSettings,
  mode: RpcMode = 'cursor-sdk',
  store?: OutlineStoreType,
): SessionRpcAdapter {
  if (mode === 'mock') {
    return new MockSessionRpcAdapter();
  }
  const outlineStore = store ?? new OutlineStore(settings.workspaceId);
  return new CursorSdkSessionRpcAdapter({
    store: outlineStore,
    workspaceId: settings.workspaceId,
    allowMockFallback: isMockFallbackAllowed(),
  });
}

export async function createConnectedRpcAdapter(
  settings: LinerSettings,
  preferred?: RpcMode,
  store?: OutlineStoreType,
): Promise<SessionRpcAdapter> {
  const mode = await resolveRpcMode(settings, preferred);
  const adapter = createRpcAdapter(settings, mode, store);
  await adapter.connect();
  return adapter;
}
