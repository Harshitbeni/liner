import { createConnectedRpcAdapter } from './rpc/index';
import { buildSessionContext } from './session-context';
import { isPackagedMode } from './engine-info';
import { OutlineStore } from './store';

export type VerifyCraftResult = {
  exitCode: number;
  ok: boolean;
  message: string;
  rpcMode?: string;
  skipped?: boolean;
};

/**
 * Run Craft smoke logic (session + message). Mirrors scripts/craft-smoke.ts exit codes.
 * 0 = Craft connected; 2 = mock-only; 1 = failure.
 */
export async function verifyCraftConnection(options?: {
  craftRpcUrl?: string;
  craftWorkspaceId?: string;
  forceCraft?: boolean;
  skip?: boolean;
}): Promise<VerifyCraftResult> {
  if (options?.skip || process.env.CRAFT_SKIP === '1') {
    return {
      exitCode: 0,
      ok: true,
      message: 'Craft verification skipped (CRAFT_SKIP=1)',
      skipped: true,
    };
  }

  const url =
    options?.craftRpcUrl ?? process.env.CRAFT_RPC_URL ?? 'ws://127.0.0.1:9100';
  const forceCraft =
    options?.forceCraft ?? process.env.LINER_RPC_MODE === 'craft';

  const store = new OutlineStore('verify-craft');
  const settings = store.getSettings();
  settings.craftRpcUrl = url;
  if (options?.craftWorkspaceId) {
    settings.craftWorkspaceId = options.craftWorkspaceId;
  }

  let rpc;
  try {
    rpc = await createConnectedRpcAdapter(settings, forceCraft ? 'craft' : undefined);
  } catch (e) {
    return {
      exitCode: 1,
      ok: false,
      message: `Failed to connect RPC: ${e}`,
    };
  }

  const usedMock = rpc.mode === 'mock';

  if (forceCraft && usedMock) {
    await rpc.disconnect();
    return {
      exitCode: 2,
      ok: false,
      message: isPackagedMode()
        ? 'AI engine unreachable. Reinstall with build:desktop:bundled or check Settings → AI Engine.'
        : 'LINER_RPC_MODE=craft but Craft server is unreachable. Start: bun run craft:server',
      rpcMode: rpc.mode,
    };
  }

  try {
    const area = store.listAreas()[0];
    const point = store.createPoint({
      task: 'Craft verify',
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

    await new Promise((r) => setTimeout(r, usedMock ? 2_000 : 8_000));
    unsub();

    const messages = await rpc.getMessages(sessionId);
    await rpc.disconnect();

    if (usedMock) {
      return {
        exitCode: 2,
        ok: false,
        message: isPackagedMode()
          ? 'Engine not reachable — demo RPC only. Start Liner.app with bundled engine or configure provider keys in Craft workspace.'
          : 'Craft server not running — verification used mock RPC. Start: bun run craft:server',
        rpcMode: 'mock',
      };
    }

    if (!gotReply && messages.length < 2) {
      return {
        exitCode: 1,
        ok: false,
        message:
          'No assistant reply — engine connected but check provider API keys in Craft workspace config.',
        rpcMode: rpc.mode,
      };
    }

    return {
      exitCode: 0,
      ok: true,
      message: 'Craft connected — session created and assistant replied.',
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
