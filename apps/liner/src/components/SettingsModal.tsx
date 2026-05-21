import * as React from 'react';
import type { LinerSettings } from '@liner/core';
import { api, type HealthResponse, type WorkspaceInfo } from '../api';
import { CraftSetupPanel } from './CraftSetupPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type Tab = 'general' | 'craft' | 'agents' | 'appearance' | 'shortcuts';

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'craft', label: 'AI Engine' },
  { id: 'agents', label: 'Agents' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'shortcuts', label: 'Shortcuts' },
];

type Props = {
  open: boolean;
  onClose: () => void;
  onWorkspaceChanged?: () => void;
  health?: HealthResponse | null;
  onHealthRefresh?: () => void;
};

export function SettingsModal({
  open,
  onClose,
  onWorkspaceChanged,
  health,
  onHealthRefresh,
}: Props) {
  const [tab, setTab] = React.useState<Tab>('general');
  const [settings, setSettings] = React.useState<LinerSettings | null>(null);
  const [workspaces, setWorkspaces] = React.useState<WorkspaceInfo[]>([]);
  const [newWorkspaceId, setNewWorkspaceId] = React.useState('');
  const [workspaceBusy, setWorkspaceBusy] = React.useState(false);
  const [subagents, setSubagents] = React.useState<
    Array<{ id: string; label: string; description: string }>
  >([]);

  React.useEffect(() => {
    if (open) {
      api.getSettings().then(setSettings);
      api.listWorkspaces().then(setWorkspaces);
      api.listSubagents().then(setSubagents);
    }
  }, [open]);

  const patch = async (p: Partial<LinerSettings>) => {
    const next = await api.updateSettings(p);
    setSettings(next);
    document.documentElement.dataset.theme =
      next.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : next.theme;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1">
          <nav className="flex w-36 shrink-0 flex-col gap-0.5 border-r border-border p-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={cn(
                  'cursor-pointer rounded-md px-3 py-2 text-left text-sm transition-colors',
                  tab === t.id
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <ScrollArea className="min-h-[320px] flex-1">
            <div className="space-y-4 p-5">
              {tab === 'general' && settings ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="craft-rpc">Craft RPC URL</Label>
                    <Input
                      id="craft-rpc"
                      value={settings.craftRpcUrl}
                      onChange={(e) => patch({ craftRpcUrl: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="craft-ws">Craft workspace ID</Label>
                    <Input
                      id="craft-ws"
                      value={settings.craftWorkspaceId}
                      onChange={(e) =>
                        patch({ craftWorkspaceId: e.target.value })
                      }
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input"
                      checked={settings.autoAgents}
                      onChange={(e) => patch({ autoAgents: e.target.checked })}
                    />
                    Auto-run agents on state changes
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input"
                      checked={settings.strictPlanGate}
                      onChange={(e) =>
                        patch({ strictPlanGate: e.target.checked })
                      }
                    />
                    Strict plan gate (parent can block child review)
                  </label>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Workspace</Label>
                    <Select
                      value={settings.workspaceId}
                      disabled={workspaceBusy}
                      onValueChange={async (id) => {
                        if (id === settings.workspaceId) return;
                        setWorkspaceBusy(true);
                        try {
                          await api.switchWorkspace(id);
                          const next = await api.getSettings();
                          setSettings(next);
                          setWorkspaces(await api.listWorkspaces());
                          onWorkspaceChanged?.();
                        } finally {
                          setWorkspaceBusy(false);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {workspaces.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.id}
                            {w.isActive ? ' (active)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Input
                        value={newWorkspaceId}
                        onChange={(e) => setNewWorkspaceId(e.target.value)}
                        placeholder="new-workspace-id"
                        disabled={workspaceBusy}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={workspaceBusy || !newWorkspaceId.trim()}
                        onClick={async () => {
                          const id = newWorkspaceId.trim();
                          setWorkspaceBusy(true);
                          try {
                            await api.createWorkspace(id);
                            await api.switchWorkspace(id);
                            setNewWorkspaceId('');
                            setSettings(await api.getSettings());
                            setWorkspaces(await api.listWorkspaces());
                            onWorkspaceChanged?.();
                          } finally {
                            setWorkspaceBusy(false);
                          }
                        }}
                      >
                        Create
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Stored under ~/.liner/workspaces/
                    </p>
                  </div>
                </>
              ) : null}

              {tab === 'craft' ? (
                <CraftSetupPanel
                  health={health ?? null}
                  onHealthRefresh={onHealthRefresh}
                />
              ) : null}

              {tab === 'agents' ? (
                <ul className="m-0 list-none space-y-0 p-0">
                  {subagents.map((a) => (
                    <li
                      key={a.id}
                      className="border-b border-border py-3 last:border-0"
                    >
                      <strong className="text-sm">@{a.id}</strong>
                      <span className="text-sm text-muted-foreground">
                        {' '}
                        — {a.label}
                      </span>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {a.description}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}

              {tab === 'appearance' && settings ? (
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <Select
                    value={settings.theme}
                    onValueChange={(v) =>
                      patch({ theme: v as LinerSettings['theme'] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">System</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="light">Light</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {tab === 'shortcuts' ? (
                <table className="w-full text-sm">
                  <tbody className="[&_td]:py-2 [&_td:first-child]:pr-4 [&_td:first-child]:text-muted-foreground">
                    <tr>
                      <td>
                        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                          ⌘
                        </kbd>{' '}
                        +{' '}
                        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                          N
                        </kbd>
                      </td>
                      <td>New task</td>
                    </tr>
                    <tr>
                      <td>
                        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                          ⌘
                        </kbd>{' '}
                        +{' '}
                        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                          ,
                        </kbd>
                      </td>
                      <td>Settings</td>
                    </tr>
                    <tr>
                      <td>
                        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                          j
                        </kbd>{' '}
                        /{' '}
                        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                          k
                        </kbd>
                      </td>
                      <td>Navigate outline</td>
                    </tr>
                    <tr>
                      <td>
                        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                          ⌘
                        </kbd>{' '}
                        +{' '}
                        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                          Enter
                        </kbd>
                      </td>
                      <td>Send message</td>
                    </tr>
                    <tr>
                      <td>
                        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                          P
                        </kbd>
                        ,{' '}
                        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                          A
                        </kbd>
                        ,{' '}
                        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                          S
                        </kbd>
                        ,{' '}
                        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                          X
                        </kbd>
                      </td>
                      <td>Promote, approve, ship, cancel</td>
                    </tr>
                  </tbody>
                </table>
              ) : null}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter className="border-t border-border px-5 py-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
