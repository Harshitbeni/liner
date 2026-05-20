import * as React from 'react';
import type { Area } from '@liner/core';
import { api, type HealthResponse, subscribePointEvents } from './api';
import { useToast } from './toast';
import { OutlineTree } from './components/OutlineTree';
import { PointDetail } from './components/PointDetail';
import { FirstRunWizard } from './components/FirstRunWizard';
import { SettingsModal } from './components/SettingsModal';
import { TaskCreator } from './components/TaskCreator';
import {
  loadSelectedAreaId,
  loadSelectedPointId,
  saveSelectedAreaId,
  saveSelectedPointId,
} from './storage';

export default function App() {
  const [areas, setAreas] = React.useState<Area[]>([]);
  const [selectedAreaId, setSelectedAreaId] = React.useState<string | null>(
    () => loadSelectedAreaId(),
  );
  const [selectedPointId, setSelectedPointId] = React.useState<string | null>(
    null,
  );
  const [areaDescription, setAreaDescription] = React.useState('');
  const [contextOpen, setContextOpen] = React.useState(true);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [showCreator, setShowCreator] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [health, setHealth] = React.useState<HealthResponse | null>(null);
  const { show: showToast } = useToast();
  const [runningPointIds, setRunningPointIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [areaAgentBusy, setAreaAgentBusy] = React.useState(false);
  const [showFirstRun, setShowFirstRun] = React.useState(false);

  const refresh = () => setRefreshKey((k) => k + 1);

  const selectArea = (id: string) => {
    setSelectedAreaId(id);
    saveSelectedAreaId(id);
    const savedPoint = loadSelectedPointId(id);
    setSelectedPointId(savedPoint);
  };

  const selectPoint = (id: string) => {
    setSelectedPointId(id);
    if (selectedAreaId) saveSelectedPointId(selectedAreaId, id);
  };

  const refreshHealth = React.useCallback(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  React.useEffect(() => {
    refreshHealth();
    const t = window.setInterval(refreshHealth, 10_000);
    api.listAreas().then((list) => {
      setAreas(list);
      const storedArea = loadSelectedAreaId();
      const areaId =
        storedArea && list.some((a) => a.id === storedArea)
          ? storedArea
          : list[0]?.id ?? null;
      if (areaId) {
        setSelectedAreaId(areaId);
        const savedPoint = loadSelectedPointId(areaId);
        if (savedPoint) setSelectedPointId(savedPoint);
        const area = list.find((a) => a.id === areaId);
        if (area) setAreaDescription(area.description);
      }
    });
    return () => window.clearInterval(t);
  }, [refreshHealth]);

  React.useEffect(() => {
    const area = areas.find((a) => a.id === selectedAreaId);
    if (area) setAreaDescription(area.description);
  }, [selectedAreaId, areas]);

  React.useEffect(() => {
    if (!selectedAreaId) return;
    api.listPoints(selectedAreaId, null).then((roots) => {
      const dismissed = localStorage.getItem('liner:first-run-dismissed');
      if (roots.length === 0 && !dismissed) setShowFirstRun(true);
    });
  }, [selectedAreaId, refreshKey]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        setShowCreator(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectedArea = areas.find((a) => a.id === selectedAreaId);

  const saveAreaDescription = async () => {
    if (!selectedAreaId) return;
    await api.updateArea(selectedAreaId, { description: areaDescription });
    const list = await api.listAreas();
    setAreas(list);
  };

  const refineAreaWithAgent = async () => {
    if (!selectedAreaId) return;
    setAreaAgentBusy(true);
    try {
      await api.runAreaAgent(selectedAreaId);
      const list = await api.listAreas();
      setAreas(list);
      const area = list.find((a) => a.id === selectedAreaId);
      if (area) setAreaDescription(area.description);
      refresh();
    } finally {
      setAreaAgentBusy(false);
    }
  };

  const trackAgentRunning = React.useCallback((pointId: string, running: boolean) => {
    setRunningPointIds((prev) => {
      const next = new Set(prev);
      if (running) next.add(pointId);
      else next.delete(pointId);
      return next;
    });
  }, []);

  React.useEffect(() => {
    if (!selectedPointId) return;
    const unsub = subscribePointEvents(selectedPointId, {
      onMessage: () => {},
      onAgentStatus: (running) => trackAgentRunning(selectedPointId, running),
    });
    api.getAgentStatus(selectedPointId).then((s) => {
      trackAgentRunning(selectedPointId, s.running);
    });
    return unsub;
  }, [selectedPointId, trackAgentRunning]);

  const packaged = health?.engine?.packaged ?? false;
  const showRpcBanner =
    health &&
    (health.rpc === 'mock' ||
      !health.craftReachable ||
      health.engine?.state === 'failed' ||
      health.engine?.state === 'mock-fallback');

  const apiStatus = health
    ? health.engine?.version
      ? `AI Engine ${health.engine.version} · ${health.workspaceId ?? 'default'}`
      : `${health.rpc} RPC · ${health.workspaceId ?? 'default'}`
    : 'API offline';

  return (
    <>
      {showRpcBanner ? (
        <div className="rpc-banner" role="status">
          {packaged
            ? health!.engine?.state === 'failed'
              ? 'AI engine failed to start — see Settings → AI Engine.'
              : health!.rpc === 'mock' || health!.engine?.state === 'mock-fallback'
                ? 'Demo mode — bundled engine unavailable or credentials missing. Settings → AI Engine.'
                : 'AI engine not ready — check Settings → AI Engine.'
            : health!.rpc === 'mock'
              ? 'Mock RPC — start Craft (`bun run craft:server`) for real agent sessions.'
              : 'Craft unreachable — using fallback. Check `bun run craft:server` and RPC URL in Settings.'}
          {health!.lastError ? (
            <span className="rpc-banner-detail"> ({health!.lastError})</span>
          ) : null}
        </div>
      ) : null}
      <div className="app-shell">
        <aside className="panel">
          <div className="panel-header">
            <span>Areas</span>
            <button
              type="button"
              onClick={async () => {
                const a = await api.createArea('New Area');
                setAreas(await api.listAreas());
                selectArea(a.id);
              }}
            >
              +
            </button>
          </div>
          <div className="panel-body">
            {areas.length === 0 ? (
              <div className="empty-state">
                <p>No areas yet</p>
                <button
                  type="button"
                  onClick={async () => {
                    const a = await api.createArea('Inbox');
                    setAreas(await api.listAreas());
                    selectArea(a.id);
                  }}
                >
                  Create Inbox
                </button>
              </div>
            ) : (
              areas.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`area-chip ${selectedAreaId === a.id ? 'active' : ''}`}
                  onClick={() => selectArea(a.id)}
                >
                  {a.icon ? `${a.icon} ` : ''}
                  {a.name}
                </button>
              ))
            )}
          </div>
          <div
            style={{
              padding: 8,
              borderTop: '1px solid var(--border)',
              fontSize: 11,
              color: 'var(--text-muted)',
            }}
          >
            <span>{apiStatus}</span>
            <button
              type="button"
              style={{ marginLeft: 8 }}
              onClick={() => setShowSettings(true)}
              title="Settings (⌘,) — AI Engine tab"
            >
              ⚙
            </button>
          </div>
        </aside>

        <section className="panel">
          <div className="panel-header">
            <span>{selectedArea?.name ?? 'Tasks'}</span>
            <button type="button" onClick={() => setShowCreator(true)}>
              New
            </button>
          </div>
          <div className="panel-body">
            {selectedAreaId ? (
              <OutlineTree
                areaId={selectedAreaId}
                selectedId={selectedPointId}
                onSelect={selectPoint}
                refreshKey={refreshKey}
                runningPointIds={runningPointIds}
              />
            ) : (
              <div className="empty-state">
                <p>Select an area to see tasks</p>
                <p className="empty-state-hint">Or create one with + in the sidebar</p>
              </div>
            )}
          </div>
        </section>

        <main className="panel" style={{ borderRight: 'none' }}>
          {selectedArea ? (
            <>
              <div className="area-context">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <h2>{selectedArea.name}</h2>
                  <button
                    type="button"
                    onClick={() => setContextOpen((o) => !o)}
                  >
                    {contextOpen ? 'Hide' : 'Show'} context
                  </button>
                  <button
                    type="button"
                    disabled={areaAgentBusy}
                    onClick={refineAreaWithAgent}
                  >
                    {areaAgentBusy ? 'Refining…' : 'Refine with agent'}
                  </button>
                </div>
                {contextOpen ? (
                  <textarea
                    value={areaDescription}
                    onChange={(e) => setAreaDescription(e.target.value)}
                    onBlur={saveAreaDescription}
                    rows={3}
                    placeholder="Area description — shared human/agent context"
                  />
                ) : null}
              </div>
              <PointDetail
                pointId={selectedPointId}
                onUpdated={refresh}
                onNewPoint={() => setShowCreator(true)}
                onStateNotice={(from, to, actor) =>
                  showToast(
                    `${actor}: ${from.replace(/-/g, ' ')} → ${to.replace(/-/g, ' ')}`,
                  )
                }
              />
            </>
          ) : (
            <div className="empty-state">
              <h2>Welcome to Liner</h2>
              <p>Create an area, add tasks, and promote them through your agent workflow.</p>
            </div>
          )}
        </main>
      </div>

      {showCreator && selectedAreaId ? (
        <TaskCreator
          areaId={selectedAreaId}
          parentId={selectedPointId}
          onCreated={(id) => {
            refresh();
            selectPoint(id);
          }}
          onClose={() => setShowCreator(false)}
        />
      ) : null}

      {showFirstRun && selectedAreaId ? (
        <FirstRunWizard
          areaId={selectedAreaId}
          onDone={(id) => {
            localStorage.setItem('liner:first-run-dismissed', '1');
            setShowFirstRun(false);
            refresh();
            selectPoint(id);
          }}
          onDismiss={() => {
            localStorage.setItem('liner:first-run-dismissed', '1');
            setShowFirstRun(false);
          }}
        />
      ) : null}

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        health={health}
        onHealthRefresh={refreshHealth}
        onWorkspaceChanged={() => {
          refreshHealth();
          api.listAreas().then((list) => {
            setAreas(list);
            const areaId = list[0]?.id ?? null;
            setSelectedAreaId(areaId);
            setSelectedPointId(null);
            if (areaId) {
              const area = list.find((a) => a.id === areaId);
              if (area) setAreaDescription(area.description);
            }
            refresh();
          });
          showToast('Workspace switched');
        }}
      />
    </>
  );
}
