import { createConnectedRpcAdapter } from './rpc/index';
import { buildSessionContext } from './session-context';
import { hasProviderKey } from './provider-auth';
import { isPackagedMode } from './engine-info';
import { OutlineStore } from './store';

export type VerifyEngineResult = {
  exitCode: number;
  ok: boolean;
  message: string;
  rpcMode?: string;
  skipped?: boolean;
};

/**
 * Run engine smoke logic (session + message). Mirrors scripts/engine-smoke.ts exit codes.
 * 0 = OpenCode connected; 2 = mock-only; 1 = failure.
 */
export async function verifyEngineConnection(options?: {
  opencodeBaseUrl?: string;
  forceOpencode?: boolean;
  skip?: boolean;
}): Promise<VerifyEngineResult> {
  if (options?.skip || process.env.ENGINE_SKIP === '1' || process.env.CRAFT_SKIP === '1') {
    return {
      exitCode: 0,
      ok: true,
      message: 'Engine verification skipped (ENGINE_SKIP=1)',
      skipped: true,
    };
  }

  const baseUrl =
    options?.opencodeBaseUrl ??
    process.env.OPENCODE_BASE_URL ??
    'http://127.0.0.1:4096';
  const forceOpencode =
    options?.forceOpencode ??
    process.env.LINER_RPC_MODE === 'opencode';

  const store = new OutlineStore('verify-engine');
  const settings = store.getSettings();
  settings.opencodeBaseUrl = baseUrl;

  let rpc;
  try {
    rpc = await createConnectedRpcAdapter(
      settings,
      forceOpencode ? 'opencode' : undefined,
    );
  } catch (e) {
    return {
      exitCode: 1,
      ok: false,
      message: `Failed to connect RPC: ${e}`,
    };
  }

  const usedMock = rpc.mode === 'mock';

  if (forceOpencode && usedMock) {
    await rpc.disconnect();
    return {
      exitCode: 2,
      ok: false,
      message: isPackagedMode()
        ? 'AI engine unreachable. Reinstall with build:desktop:bundled or check Settings → AI Provider.'
        : 'LINER_RPC_MODE=opencode but OpenCode is unreachable. Install opencode CLI or start the managed engine.',
      rpcMode: rpc.mode,
    };
  }

  const providerId = settings.aiProviderId || 'anthropic';
  if (!usedMock && !hasProviderKey(providerId) && providerId !== 'ollama') {
    await rpc.disconnect();
    return {
      exitCode: 1,
      ok: false,
      message: `No API key for provider "${providerId}". Add one in Settings → AI Provider.`,
      rpcMode: rpc.mode,
    };
  }

  try {
    const area = store.listAreas()[0];
    const point = store.createPoint({
      task: 'Engine verify',
      areaId: area.id,
      state: 'todo',
    });
    const context = buildSessionContext(store, point.id);
    const sessionId = await rpc.ensureSession(null, {
      title: 'Liner verify',
      context,
    });

    await rpc.sendMessage(sessionId, 'Reply with exactly: LINER_SMOKE_OK');

    let gotReply = false;
    const unsub = rpc.subscribe(sessionId, (msg) => {
      if (msg.role === 'assistant' && !msg.meta?.streaming) {
        gotReply = true;
      }
    });

    await new Promise((r) => setTimeout(r, usedMock ? 2_000 : 12_000));
    unsub();

    const messages = await rpc.getMessages(sessionId);
    await rpc.disconnect();

    if (usedMock) {
      return {
        exitCode: 2,
        ok: false,
        message: isPackagedMode()
          ? 'Engine not reachable — demo RPC only. Configure provider keys in Settings → AI Provider.'
          : 'OpenCode not running — verification used mock RPC. Start Liner dev server or install opencode.',
        rpcMode: 'mock',
      };
    }

    if (!gotReply && messages.length < 2) {
      return {
        exitCode: 1,
        ok: false,
        message:
          'No assistant reply — engine connected but check provider API keys in Settings → AI Provider.',
        rpcMode: rpc.mode,
      };
    }

    return {
      exitCode: 0,
      ok: true,
      message: 'OpenCode connected — session created and assistant replied.',
      rpcMode: rpc.mode,
    };
  } catch (e) {
    await rpc.disconnect().catch(() => {});
    return {
      exitCode: 1,
      ok: false,
      message: String(e),
      rpcMode: rpc.mode,
    };
  }
}
