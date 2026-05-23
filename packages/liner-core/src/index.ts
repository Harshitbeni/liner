export * from './types';
export * from './paths';
export * from './schema';
export * from './store';
export * from './state-machine';
export * from './mentions';
export * from './harness';
export * from './rpc/index';
export * from './session-context';
export * from './agent-prompts';
export * from './skills';
export * from './verify-engine';
export * from './provider-auth';
export * from './workspaces';
export * from './engine-info';
export * from './engine/index';

import { DEFAULT_WORKSPACE_ID } from './paths';
import { OutlineStore } from './store';
import { HarnessOrchestrator } from './harness';
import { createConnectedRpcAdapter } from './rpc/index';
import type { RpcMode } from './rpc/types';

export type LinerRuntime = {
  store: OutlineStore;
  rpc: Awaited<ReturnType<typeof createConnectedRpcAdapter>>;
  harness: HarnessOrchestrator;
};

export async function createLinerRuntime(
  workspaceId?: string,
  rpcMode?: RpcMode,
): Promise<LinerRuntime> {
  const id =
    workspaceId ??
    process.env.LINER_WORKSPACE_ID ??
    DEFAULT_WORKSPACE_ID;
  const store = new OutlineStore(id);
  const settings = store.getSettings();
  const rpc = await createConnectedRpcAdapter(settings, rpcMode, store);
  const harness = new HarnessOrchestrator(store, rpc, {
    strictPlanGate: settings.strictPlanGate,
  });
  return { store, rpc, harness };
}
