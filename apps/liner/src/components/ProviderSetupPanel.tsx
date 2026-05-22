import * as React from 'react';
import type { HealthResponse } from '../api';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Props = {
  health: HealthResponse | null;
  onHealthRefresh?: () => void;
};

function engineLabel(health: HealthResponse | null): string {
  const eng = health?.engine;
  if (!eng) return '—';
  if (eng.source === 'bundled' && eng.version) {
    return `Bundled OpenCode ${eng.version}`;
  }
  if (eng.version) return `OpenCode ${eng.version}`;
  return eng.source === 'bundled' ? 'Bundled engine' : 'Development';
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

export function ProviderSetupPanel({ health, onHealthRefresh }: Props) {
  const [providers, setProviders] = React.useState<
    Array<{ id: string; label: string; hint: string }>
  >([]);
  const [selectedId, setSelectedId] = React.useState('anthropic');
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
      setProviders(cfg.providers);
      setSelectedId(cfg.selectedProviderId || 'anthropic');
    });
  }, []);

  const saveProvider = async () => {
    setSaveBusy(true);
    setSaved(false);
    try {
      await api.saveProviderConfig({
        providerId: selectedId,
        apiKey,
        selectedProviderId: selectedId,
      });
      setApiKey('');
      setSaved(true);
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
      setVerifyResult({
        exitCode: 1,
        ok: false,
        message: String(e),
      });
    } finally {
      setVerifyBusy(false);
    }
  };

  const reachable =
    health?.engineReachable ?? false;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Liner runs a local <strong>OpenCode</strong> engine for agent sessions.
        Bring your own API key — stored in{' '}
        <code className="text-xs">~/.liner/auth.json</code> (OpenCode-compatible).
      </p>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">Engine</span>
          <p className="font-medium">{engineLabel(health)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Status</span>
          <p className="font-medium">{engineStateLabel(health?.engine?.state)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">RPC mode</span>
          <p className="font-medium">{health?.rpc ?? '—'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Engine reachable</span>
          <p className="font-medium">{reachable ? 'yes' : 'no'}</p>
        </div>
      </div>

      {health?.engine?.error || health?.lastError ? (
        <p className="text-sm text-destructive">
          {health.engine?.error ?? health.lastError}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label>Provider</Label>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {providers.find((p) => p.id === selectedId)?.hint ??
            'API key for the selected provider'}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="provider-key">API key</Label>
        <Input
          id="provider-key"
          type="password"
          autoComplete="off"
          placeholder="Paste key (leave blank to keep existing)"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={saveBusy}
          onClick={saveProvider}
        >
          {saveBusy ? 'Saving…' : 'Save provider'}
        </Button>
        <Button type="button" disabled={verifyBusy} onClick={runVerify}>
          {verifyBusy ? 'Verifying…' : 'Verify Engine'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => onHealthRefresh?.()}>
          Refresh health
        </Button>
      </div>

      {saved ? (
        <p className="text-sm text-muted-foreground" role="status">
          Provider settings saved.
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
        Default: Anthropic Claude. OpenRouter works without a direct Anthropic account.
        Ollama runs locally with no key. See <code>docs/ENGINE.md</code>.
      </p>
    </div>
  );
}
