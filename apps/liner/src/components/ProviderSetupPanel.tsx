import * as React from 'react';
import type { HealthResponse } from '../api';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  health: HealthResponse | null;
  onHealthRefresh?: () => void;
};

function engineLabel(health: HealthResponse | null): string {
  const eng = health?.engine;
  if (!eng) return '—';
  if (eng.name === 'cursor-sdk') return 'Cursor SDK (local)';
  return eng.name;
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
      return 'Not configured';
    default:
      return state ?? '—';
  }
}

export function ProviderSetupPanel({ health, onHealthRefresh }: Props) {
  const [config, setConfig] = React.useState<{
    model: string;
    modelLabel: string;
    workspaceSandbox: string;
    hasApiKey: boolean;
  } | null>(null);
  const [apiKey, setApiKey] = React.useState('');
  const [saveBusy, setSaveBusy] = React.useState(false);
  const [verifyBusy, setVerifyBusy] = React.useState(false);
  const [verifyResult, setVerifyResult] = React.useState<{
    exitCode: number;
    message: string;
    ok: boolean;
  } | null>(null);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    api.getProviderConfig().then((cfg) => {
      setConfig({
        model: cfg.model,
        modelLabel: cfg.modelLabel,
        workspaceSandbox: cfg.workspaceSandbox,
        hasApiKey: cfg.hasApiKey,
      });
    });
  }, []);

  const saveKey = async () => {
    setSaveBusy(true);
    setSaved(false);
    try {
      await api.saveProviderConfig({ apiKey });
      setApiKey('');
      setSaved(true);
      const cfg = await api.getProviderConfig();
      setConfig({
        model: cfg.model,
        modelLabel: cfg.modelLabel,
        workspaceSandbox: cfg.workspaceSandbox,
        hasApiKey: cfg.hasApiKey,
      });
      onHealthRefresh?.();
    } finally {
      setSaveBusy(false);
    }
  };

  const runVerify = async () => {
    setVerifyBusy(true);
    setVerifyResult(null);
    try {
      const result = await api.verifyEngine();
      setVerifyResult(result);
      onHealthRefresh?.();
    } catch (e) {
      const message =
        e instanceof Error
          ? e.name === 'TimeoutError'
            ? 'Request timed out — is the API running on port 9240?'
            : e.message === 'Failed to fetch'
              ? 'Cannot reach API — run `bun run dev` (or restart the desktop app).'
              : e.message
          : String(e);
      setVerifyResult({
        exitCode: 1,
        ok: false,
        message,
      });
    } finally {
      setVerifyBusy(false);
    }
  };

  const reachable = health?.engineReachable ?? config?.hasApiKey ?? false;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Liner runs agents through the local <strong>Cursor SDK</strong> with a
        fixed model (<strong>Composer 2.5</strong>). Your API key is stored in{' '}
        <code className="text-xs">~/.liner/auth.json</code>. Each workspace uses
        its own sandbox directory under{' '}
        <code className="text-xs">~/.liner/workspaces/</code>.
      </p>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">Runtime</span>
          <p className="font-medium">{engineLabel(health)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Status</span>
          <p className="font-medium">{engineStateLabel(health?.engine?.state)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Model</span>
          <p className="font-medium">{config?.modelLabel ?? 'Composer 2.5'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">RPC mode</span>
          <p className="font-medium">{health?.rpc ?? '—'}</p>
        </div>
        <div className="col-span-2">
          <span className="text-muted-foreground">Workspace sandbox</span>
          <p className="font-mono text-xs break-all">
            {config?.workspaceSandbox ?? '—'}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">API key</span>
          <p className="font-medium">
            {config?.hasApiKey ? 'configured' : 'not set'}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">SDK ready</span>
          <p className="font-medium">{reachable ? 'yes' : 'no'}</p>
        </div>
      </div>

      {health?.engine?.error || health?.lastError ? (
        <p className="text-sm text-destructive">
          {health.engine?.error ?? health.lastError}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="cursor-api-key">Cursor API key</Label>
        <Input
          id="cursor-api-key"
          type="password"
          autoComplete="off"
          placeholder="Paste key (leave blank to keep existing)"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Create a key at Cursor Dashboard → Integrations. Model is always{' '}
          {config?.model ?? 'composer-2.5'} — no model switcher.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={saveBusy}
          onClick={saveKey}
        >
          {saveBusy ? 'Saving…' : 'Save API key'}
        </Button>
        <Button type="button" disabled={verifyBusy} onClick={runVerify}>
          {verifyBusy ? 'Verifying…' : 'Verify SDK'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => onHealthRefresh?.()}>
          Refresh health
        </Button>
      </div>

      {saved ? (
        <p className="text-sm text-muted-foreground" role="status">
          Cursor API key saved.
        </p>
      ) : null}

      {verifyResult ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            verifyResult.ok
              ? 'border-green-500/40 bg-green-500/10'
              : 'border-destructive/40 bg-destructive/10'
          }`}
          role="status"
        >
          <strong>Exit {verifyResult.exitCode}</strong> — {verifyResult.message}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        See <code>docs/ENGINE.md</code> for environment variables and smoke
        checks.
      </p>
    </div>
  );
}
