import { getEngineInfo, isMockFallbackAllowed, isPackagedMode } from './engine-info';
import type { EngineInfo } from './engine-info';
import { hasCursorApiKey } from './provider-auth';
import { CursorSdkSessionRpcAdapter } from './rpc/cursor-sdk-adapter';
import type { RpcMode, SessionRpcAdapter } from './rpc/types';

export type RuntimeHealthSnapshot = {
  ok: boolean;
  rpc: string;
  connected: boolean;
  engineReachable: boolean;
  lastError: string | null;
  workspaceId: string;
  engine: EngineInfo;
};

/** Preferred RPC mode before runtime is connected (server init, verify). */
export function resolvePreferredRpcMode(): RpcMode | undefined {
  const env = process.env.LINER_RPC_MODE as RpcMode | undefined;
  if (env === 'cursor-sdk') return 'cursor-sdk';
  if (hasCursorApiKey()) return 'cursor-sdk';
  if (env === 'mock') return 'mock';
  return undefined;
}

/** Health when runtime is not initialized yet (settings routes, cold start). */
export function resolveRuntimeHealthLight(
  workspaceId: string,
): RuntimeHealthSnapshot {
  const engine = getEngineInfo();
  const hasKey = hasCursorApiKey();
  const rpcMode = hasKey ? 'cursor-sdk' : (process.env.LINER_RPC_MODE ?? 'mock');
  const lastError: string | null = hasKey
    ? engine.error
    : (engine.error ?? 'Cursor API key not configured');

  return {
    ok: true,
    rpc: rpcMode,
    connected: false,
    engineReachable: hasKey,
    lastError,
    workspaceId,
    engine,
  };
}

/** Health from a connected runtime. */
export function resolveRuntimeHealth(
  workspaceId: string,
  rpc: SessionRpcAdapter,
): RuntimeHealthSnapshot {
  const connected = rpc.isConnected();
  const engine = getEngineInfo();
  let engineReachable = hasCursorApiKey();
  let lastError: string | null = null;

  if (rpc.mode === 'mock') {
    engineReachable = false;
    lastError = isPackagedMode()
      ? 'Cursor SDK unavailable — using demo mode. Check Settings → Cursor SDK.'
      : 'Using mock RPC — add Cursor API key for Composer 2.5';
    if (isMockFallbackAllowed()) {
      engine.state = 'mock-fallback';
    }
  } else if (rpc instanceof CursorSdkSessionRpcAdapter) {
    engineReachable = rpc.isSdkNative();
    lastError = rpc.getLastError();
    if (rpc.isSdkNative()) {
      engine.state = 'ready';
    } else {
      const err = lastError ?? engine.error ?? 'Cursor SDK unavailable';
      lastError = err;
      if (isMockFallbackAllowed()) {
        engine.state = 'mock-fallback';
        lastError = lastError ?? 'Connected via demo fallback';
      } else {
        engine.state = 'failed';
      }
    }
  }

  if (!hasCursorApiKey()) {
    lastError = lastError ?? 'Cursor API key not configured';
    engineReachable = false;
  }

  return {
    ok: true,
    rpc: rpc.mode,
    connected,
    engineReachable,
    lastError,
    workspaceId,
    engine,
  };
}
