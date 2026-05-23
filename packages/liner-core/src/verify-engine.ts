import { workspaceDir } from './paths';
import { createConnectedRpcAdapter } from './rpc/index';
import { CursorSdkSessionRpcAdapter } from './rpc/cursor-sdk-adapter';
import { buildSessionContext } from './session-context';
import { hasCursorApiKey } from './provider-auth';
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
 * Verify Cursor SDK connectivity (session + assistant reply).
 * Exit codes: 0 = SDK connected; 2 = mock-only; 1 = failure.
 */
export async function verifyEngineConnection(options?: {
  forceCursorSdk?: boolean;
  skip?: boolean;
}): Promise<VerifyEngineResult> {
  if (options?.skip || process.env.ENGINE_SKIP === '1') {
    return {
      exitCode: 0,
      ok: true,
      message: 'Engine verification skipped (ENGINE_SKIP=1)',
      skipped: true,
    };
  }

  const forceCursorSdk =
    options?.forceCursorSdk ??
    (hasCursorApiKey() || process.env.LINER_RPC_MODE === 'cursor-sdk');

  const store = new OutlineStore('verify-engine');
  const settings = store.getSettings();

  if (!hasCursorApiKey() && forceCursorSdk) {
    return {
      exitCode: 1,
      ok: false,
      message:
        'No Cursor API key configured. Add one in Settings → Cursor SDK.',
    };
  }

  let rpc;
  try {
    rpc = await createConnectedRpcAdapter(
      settings,
      forceCursorSdk ? 'cursor-sdk' : undefined,
      store,
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    const hint = detail.includes('401') || /auth/i.test(detail)
      ? ' Check the key at https://cursor.com/dashboard/integrations'
      : '';
    return {
      exitCode: 1,
      ok: false,
      message: `Cursor SDK connection failed: ${detail}.${hint}`,
    };
  }

  const usedMock = rpc.mode === 'mock';

  if (forceCursorSdk && usedMock) {
    await rpc.disconnect();
    return {
      exitCode: 2,
      ok: false,
      message: isPackagedMode()
        ? 'Cursor SDK unavailable — check API key in Settings → Cursor SDK.'
        : 'LINER_RPC_MODE=cursor-sdk but SDK is unavailable. Set CURSOR_API_KEY or ~/.liner/auth.json.',
      rpcMode: rpc.mode,
    };
  }

  if (!usedMock && !hasCursorApiKey()) {
    await rpc.disconnect();
    return {
      exitCode: 1,
      ok: false,
      message: 'No Cursor API key. Add one in Settings → Cursor SDK.',
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

    if (rpc instanceof CursorSdkSessionRpcAdapter) {
      try {
        await rpc.waitForSessionIdle(sessionId, 60_000);
      } catch (e) {
        await rpc.disconnect().catch(() => {});
        return {
          exitCode: 1,
          ok: false,
          message: e instanceof Error ? e.message : String(e),
          rpcMode: rpc.mode,
        };
      }
    } else {
      await new Promise((r) => setTimeout(r, 2_000));
    }

    const messages = await rpc.getMessages(sessionId);
    const agentError = messages.find(
      (m) =>
        m.role === 'assistant' &&
        m.content.includes('_Agent error:'),
    );
    await rpc.disconnect();

    if (agentError) {
      const detail = agentError.content
        .replace(/^_Agent error:\s*/i, '')
        .replace(/_$/g, '')
        .trim();
      return {
        exitCode: 1,
        ok: false,
        message: detail || 'Cursor agent run failed',
        rpcMode: rpc.mode,
      };
    }

    const gotReply = messages.some(
      (m) => m.role === 'assistant' && !m.meta?.streaming && m.content.trim(),
    );

    if (usedMock) {
      return {
        exitCode: 2,
        ok: false,
        message: isPackagedMode()
          ? 'Cursor SDK not configured — demo RPC only. Add API key in Settings → Cursor SDK.'
          : 'Using mock RPC — set CURSOR_API_KEY or add key in Settings for live Composer 2.5.',
        rpcMode: 'mock',
      };
    }

    if (!gotReply) {
      const lastErr =
        rpc instanceof CursorSdkSessionRpcAdapter
          ? rpc.getLastError()
          : null;
      return {
        exitCode: 1,
        ok: false,
        message:
          lastErr ??
          'No assistant reply — ensure Cursor desktop/CLI can run local agents and the API key is valid.',
        rpcMode: rpc.mode,
      };
    }

    return {
      exitCode: 0,
      ok: true,
      message: `Cursor SDK connected (Composer 2.5, sandbox ${workspaceDir(settings.workspaceId)}).`,
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
