import * as React from 'react';
import type { HealthResponse } from '../api';
import { api } from '../api';

type Props = {
  health: HealthResponse | null;
  onHealthRefresh?: () => void;
};

function engineLabel(health: HealthResponse | null): string {
  const eng = health?.engine;
  if (!eng) return '—';
  if (eng.source === 'bundled' && eng.version) {
    return `Bundled Craft ${eng.version}`;
  }
  if (eng.version) return `Craft ${eng.version}`;
  return eng.source === 'bundled' ? 'Bundled engine' : 'Development vendor';
}

function engineStateLabel(state: string | undefined): string {
  switch (state) {
    case 'starting':
      return 'Starting…';
    case 'ready':
      return 'Connected';
    case 'failed':
      return 'Unavailable';
    case 'mock-fallback':
      return 'Demo fallback';
    case 'dev':
      return 'Development';
    case 'unavailable':
      return 'Not installed';
    default:
      return state ?? '—';
  }
}

export function CraftSetupPanel({ health, onHealthRefresh }: Props) {
  const [verifyBusy, setVerifyBusy] = React.useState(false);
  const [verifyResult, setVerifyResult] = React.useState<{
    exitCode: number;
    message: string;
    ok: boolean;
  } | null>(null);
  const [copied, setCopied] = React.useState(false);

  const isPackaged = health?.engine?.packaged ?? false;
  const devCraftCommand = 'bun run craft:server';

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(devCraftCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const runVerify = async () => {
    setVerifyBusy(true);
    setVerifyResult(null);
    try {
      const result = await api.verifyCraft();
      setVerifyResult(result);
      onHealthRefresh?.();
    } catch (e) {
      setVerifyResult({
        exitCode: 1,
        ok: false,
        message: String(e),
      });
    } finally {
      setVerifyBusy(false);
    }
  };

  return (
    <div className="craft-setup">
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0 }}>
        Liner runs a local <strong>AI Engine</strong> (Craft Agents) for real agent
        sessions. In the desktop app the engine starts automatically. Use{' '}
        <strong>Verify Engine</strong> to confirm RPC and provider credentials.
      </p>

      <div className="craft-health-grid">
        <div>
          <span className="craft-health-label">Engine</span>
          <strong>{engineLabel(health)}</strong>
        </div>
        <div>
          <span className="craft-health-label">Engine status</span>
          <strong>{engineStateLabel(health?.engine?.state)}</strong>
        </div>
        <div>
          <span className="craft-health-label">RPC mode</span>
          <strong>{health?.rpc ?? '—'}</strong>
        </div>
        <div>
          <span className="craft-health-label">Craft reachable</span>
          <strong>{health?.craftReachable ? 'yes' : 'no'}</strong>
        </div>
        <div>
          <span className="craft-health-label">Workspace</span>
          <strong>{health?.workspaceId ?? '—'}</strong>
        </div>
      </div>

      {health?.engine?.error || health?.lastError ? (
        <p className="craft-health-error">
          {health.engine?.error ?? health.lastError}
        </p>
      ) : null}

      {!isPackaged ? (
        <div className="field">
          <label>Dev: start engine manually</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code className="craft-command">{devCraftCommand}</code>
            <button type="button" onClick={copyCommand}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Browser dev only — after <code>vendor/craft-agents-oss</code> install.
          </span>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Provider API keys are configured in your Craft workspace (not stored in
          Liner). See <code>docs/ENGINE.md</code> in the repo for setup notes.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="primary"
          disabled={verifyBusy}
          onClick={runVerify}
        >
          {verifyBusy ? 'Verifying…' : 'Verify Engine'}
        </button>
        <button type="button" onClick={() => onHealthRefresh?.()}>
          Refresh health
        </button>
      </div>

      {verifyResult ? (
        <div
          className={`craft-verify-result ${verifyResult.ok ? 'ok' : 'fail'}`}
          role="status"
        >
          <strong>Exit {verifyResult.exitCode}</strong> — {verifyResult.message}
        </div>
      ) : null}

      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 0 }}>
        Dogfood: <code>docs/DOGFOOD.md</code> · Build:{' '}
        <code>bun run build:desktop:bundled</code>
      </p>
    </div>
  );
}
