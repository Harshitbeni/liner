import * as React from 'react';
import type { LinerSettings } from '@liner/core';
import { api, type HealthResponse, type WorkspaceInfo } from '../api';
import { CraftSetupPanel } from './CraftSetupPanel';

type Tab = 'general' | 'craft' | 'agents' | 'appearance' | 'shortcuts';

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

  if (!open) return null;

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
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-tabs">
          {(['general', 'craft', 'agents', 'appearance', 'shortcuts'] as Tab[]).map(
            (t) => (
              <button
                key={t}
                className={tab === t ? 'active' : ''}
                onClick={() => setTab(t)}
              >
                {t === 'craft' ? 'AI Engine' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ),
          )}
        </div>
        <div className="settings-content">
          {tab === 'general' && settings ? (
            <>
              <div className="field">
                <label>Craft RPC URL</label>
                <input
                  value={settings.craftRpcUrl}
                  onChange={(e) => patch({ craftRpcUrl: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Craft workspace ID</label>
                <input
                  value={settings.craftWorkspaceId}
                  onChange={(e) =>
                    patch({ craftWorkspaceId: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.autoAgents}
                    onChange={(e) => patch({ autoAgents: e.target.checked })}
                  />{' '}
                  Auto-run agents on state changes
                </label>
              </div>
              <div className="field">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.strictPlanGate}
                    onChange={(e) =>
                      patch({ strictPlanGate: e.target.checked })
                    }
                  />{' '}
                  Strict plan gate (parent can block child review)
                </label>
              </div>
              <div className="field">
                <label>Workspace</label>
                <select
                  value={settings.workspaceId}
                  disabled={workspaceBusy}
                  onChange={async (e) => {
                    const id = e.target.value;
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
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.id}
                      {w.isActive ? ' (active)' : ''}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    value={newWorkspaceId}
                    onChange={(e) => setNewWorkspaceId(e.target.value)}
                    placeholder="new-workspace-id"
                    disabled={workspaceBusy}
                  />
                  <button
                    type="button"
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
                    Create & switch
                  </button>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Stored under ~/.liner/workspaces/
                </span>
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
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
              {subagents.map((a) => (
                <li
                  key={a.id}
                  style={{
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <strong>@{a.id}</strong> — {a.label}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {a.description}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {tab === 'appearance' && settings ? (
            <div className="field">
              <label>Theme</label>
              <select
                value={settings.theme}
                onChange={(e) =>
                  patch({
                    theme: e.target.value as LinerSettings['theme'],
                  })
                }
              >
                <option value="system">System</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
          ) : null}

          {tab === 'shortcuts' ? (
            <table style={{ width: '100%', fontSize: 13 }}>
              <tbody>
                <tr>
                  <td>
                    <kbd>⌘</kbd> + <kbd>N</kbd>
                  </td>
                  <td>New task</td>
                </tr>
                <tr>
                  <td>
                    <kbd>⌘</kbd> + <kbd>,</kbd>
                  </td>
                  <td>Settings</td>
                </tr>
                <tr>
                  <td>
                    <kbd>⌘</kbd> + <kbd>Enter</kbd>
                  </td>
                  <td>Send message</td>
                </tr>
                <tr>
                  <td>
                    <kbd>⌘</kbd> + <kbd>⇧</kbd> + <kbd>S</kbd>
                  </td>
                  <td>Ship task (when done)</td>
                </tr>
              </tbody>
            </table>
          ) : null}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
