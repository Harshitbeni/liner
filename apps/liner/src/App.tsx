import * as React from 'react';
import type { ImperativePanelGroupHandle } from 'react-resizable-panels';
import type { Area, Point } from '@liner/core';
import { IconPlusSmall } from '@central-icons-react/round-outlined-radius-3-stroke-1.5/IconPlusSmall';
import { IconSettingsGear1 } from '@central-icons-react/round-filled-radius-3-stroke-1.5/IconSettingsGear1';
import { api, type HealthResponse, subscribePointEvents } from './api';
import { useToast } from './toast';
import { OutlineTree } from './components/OutlineTree';
import { PointDetail } from './components/PointDetail';
import { FirstRunWizard } from './components/FirstRunWizard';
import { SettingsModal } from './components/SettingsModal';
import { TaskCreator } from './components/TaskCreator';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { AreaProgressIcon } from './components/AreaProgressIcon';
import { InlineRename } from './components/InlineRename';
import {
  computeAreaProgress,
  type AreaProgress,
} from '@/lib/area-progress';
import {
  isInboxPlaceholder,
  isTodayView,
  partitionAreas,
  syntheticInboxArea,
  syntheticTodayArea,
} from '@/lib/areas';
import { TODAY_VIEW_ID, startOfLocalDayIso } from '@/lib/today';
import { cn } from '@/lib/utils';
import {
  DEFAULT_PANEL_LAYOUT,
  loadLayoutSizes,
  loadSelectedAreaId,
  loadSelectedPointId,
  saveLayoutSizes,
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
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [showCreator, setShowCreator] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [health, setHealth] = React.useState<HealthResponse | null>(null);
  const { show: showToast } = useToast();
  const [runningPointIds, setRunningPointIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [showFirstRun, setShowFirstRun] = React.useState(false);
  const [areaProgress, setAreaProgress] = React.useState<
    Record<string, AreaProgress>
  >({});
  const [defaultAreaId, setDefaultAreaId] = React.useState<string | null>(null);
  const todaySince = React.useMemo(() => startOfLocalDayIso(), [refreshKey]);
  const [panelLayout, setPanelLayout] = React.useState<number[]>(() =>
    loadLayoutSizes(),
  );
  const panelGroupRef = React.useRef<ImperativePanelGroupHandle>(null);

  const refresh = () => setRefreshKey((k) => k + 1);

  const onPanelLayout = React.useCallback((sizes: number[]) => {
    setPanelLayout(sizes);
    saveLayoutSizes(sizes);
  }, []);

  const resetAdjacentPanels = React.useCallback(
    (leftIndex: number, rightIndex: number) => {
      const current = [
        ...(panelGroupRef.current?.getLayout() ?? panelLayout),
      ];
      const thirdIndex = ([0, 1, 2] as const).find(
        (i) => i !== leftIndex && i !== rightIndex,
      )!;
      const thirdSize = current[thirdIndex];
      const remaining = 100 - thirdSize;
      const leftDefault = DEFAULT_PANEL_LAYOUT[leftIndex];
      const rightDefault = DEFAULT_PANEL_LAYOUT[rightIndex];
      const defaultSum = leftDefault + rightDefault;
      const layout = [...current];
      layout[leftIndex] = (leftDefault / defaultSum) * remaining;
      layout[rightIndex] = (rightDefault / defaultSum) * remaining;
      panelGroupRef.current?.setLayout(layout);
      setPanelLayout(layout);
      saveLayoutSizes(layout);
    },
    [panelLayout],
  );

  const selectArea = React.useCallback(async (id: string) => {
    let areaId = id;
    let list = areas;
    if (isInboxPlaceholder(id)) {
      const a = await api.createArea('Inbox');
      list = await api.listAreas();
      setAreas(list);
      areaId = a.id;
    }
    setSelectedAreaId(areaId);
    saveSelectedAreaId(areaId);
    const savedPoint = loadSelectedPointId(areaId);
    setSelectedPointId(savedPoint);
    if (!isTodayView(areaId)) {
      const area = list.find((a) => a.id === areaId);
      if (area) setAreaDescription(area.description);
    }
  }, [areas]);

  const selectPoint = (id: string | null) => {
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
    api.getSettings().then((s) => {
      document.documentElement.dataset.theme =
        s.theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : s.theme;
      setDefaultAreaId(s.defaultAreaId);
    });
  }, []);

  React.useEffect(() => {
    refreshHealth();
    const t = window.setInterval(refreshHealth, 10_000);
    api.listAreas().then((list) => {
      setAreas(list);
      const { inbox } = partitionAreas(list);
      const storedArea = loadSelectedAreaId();
      let areaId: string | null = null;
      if (storedArea === TODAY_VIEW_ID) {
        areaId = TODAY_VIEW_ID;
      } else if (storedArea && list.some((a) => a.id === storedArea)) {
        areaId = storedArea;
      } else if (isInboxPlaceholder(storedArea) && inbox) {
        areaId = inbox.id;
      } else if (inbox) {
        areaId = inbox.id;
      } else if (list.length === 0) {
        areaId = TODAY_VIEW_ID;
      } else {
        areaId = list[0]?.id ?? TODAY_VIEW_ID;
      }
      setSelectedAreaId(areaId);
      const savedPoint = loadSelectedPointId(areaId);
      if (savedPoint) setSelectedPointId(savedPoint);
      const area = list.find((a) => a.id === areaId);
      if (area) setAreaDescription(area.description);
    });
    return () => window.clearInterval(t);
  }, [refreshHealth]);

  React.useEffect(() => {
    if (isTodayView(selectedAreaId)) return;
    const area = areas.find((a) => a.id === selectedAreaId);
    if (area) setAreaDescription(area.description);
  }, [selectedAreaId, areas]);

  React.useEffect(() => {
    if (!selectedAreaId || isTodayView(selectedAreaId)) return;
    api.listPoints(selectedAreaId, null).then((roots) => {
      const dismissed = localStorage.getItem('liner:first-run-dismissed');
      if (roots.length === 0 && !dismissed) setShowFirstRun(true);
    });
  }, [selectedAreaId, refreshKey]);

  React.useEffect(() => {
    let cancelled = false;
    const jobs: Promise<readonly [string, AreaProgress]>[] = [
      api.listTodayPoints(todaySince).then((points) => {
        const count = points.length;
        return [
          TODAY_VIEW_ID,
          { total: count, completed: 0, ratio: count > 0 ? 1 : 0 },
        ] as const;
      }),
    ];
    const { inbox } = partitionAreas(areas);
    if (!inbox) {
      jobs.push(
        Promise.resolve([
          syntheticInboxArea().id,
          { total: 0, completed: 0, ratio: 0 },
        ] as const),
      );
    }
    for (const a of areas) {
      jobs.push(
        api.listPoints(a.id).then((points) => {
          return [a.id, computeAreaProgress(points)] as const;
        }),
      );
    }
    void Promise.all(jobs).then((entries) => {
      if (!cancelled) setAreaProgress(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [areas, refreshKey, todaySince]);

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

  const { inbox, userAreas } = React.useMemo(
    () => partitionAreas(areas),
    [areas],
  );
  const inboxNavArea = inbox ?? syntheticInboxArea();
  const todayArea = syntheticTodayArea();
  const selectedArea = isTodayView(selectedAreaId)
    ? todayArea
    : isInboxPlaceholder(selectedAreaId)
      ? inboxNavArea
      : areas.find((a) => a.id === selectedAreaId);
  const areaNames = React.useMemo(
    () => Object.fromEntries(areas.map((a) => [a.id, a.name])),
    [areas],
  );

  const creatorAreaId =
    selectedAreaId &&
    !isTodayView(selectedAreaId) &&
    !isInboxPlaceholder(selectedAreaId)
      ? selectedAreaId
      : defaultAreaId ?? inbox?.id ?? areas[0]?.id ?? null;

  const goToPointInArea = React.useCallback(
    (point: Point) => {
      void selectArea(point.areaId);
      selectPoint(point.id);
      refresh();
    },
    [refresh, selectArea],
  );

  const renderAreaRow = (
    a: Area,
    options?: { readonly?: boolean; indent?: boolean },
  ) => (
    <button
      key={a.id}
      type="button"
      className={cn(
        'mb-px flex w-full cursor-pointer items-center gap-2 py-1.5 pl-[6px] pr-2 text-left text-13 transition-colors',
        options?.indent ? 'rounded-[6px]' : 'rounded-full',
        selectedAreaId === a.id
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-neutral-100 hover:text-foreground [data-theme=dark]:hover:bg-neutral-700',
      )}
      onClick={() => void selectArea(a.id)}
    >
      <AreaProgressIcon
        area={a}
        progress={
          areaProgress[a.id] ?? {
            total: 0,
            completed: 0,
            ratio: 0,
          }
        }
      />
      {options?.readonly ? (
        <span className="flex-1 truncate">{a.name}</span>
      ) : (
        <InlineRename
          value={a.name}
          aria-label={`Rename area ${a.name}`}
          className="flex-1"
          onSave={async (name) => {
            await api.updateArea(a.id, { name });
            setAreas(await api.listAreas());
          }}
        />
      )}
    </button>
  );

  const saveAreaDescription = async () => {
    if (
      !selectedAreaId ||
      isTodayView(selectedAreaId) ||
      isInboxPlaceholder(selectedAreaId)
    ) {
      return;
    }
    await api.updateArea(selectedAreaId, { description: areaDescription });
    const list = await api.listAreas();
    setAreas(list);
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
      !health.engineReachable ||
      health.engine?.state === 'failed' ||
      health.engine?.state === 'mock-fallback');

  const apiStatus = health
    ? health.engine?.version
      ? `Engine ${health.engine.version}`
      : `${health.rpc}`
    : 'Offline';

  return (
    <>
      <div className="app-frame">
        {showRpcBanner ? (
          <div className="rpc-banner" role="status">
            {packaged
              ? health!.engine?.state === 'failed'
                ? 'AI engine failed — Settings → AI Engine'
                : health!.rpc === 'mock' || health!.engine?.state === 'mock-fallback'
                  ? 'Demo mode — Settings → AI Engine'
                  : 'AI engine not ready'
              : health!.rpc === 'mock'
                ? 'Mock RPC — demo mode (set LINER_RPC_MODE=opencode for live agents)'
                : health!.engine?.state === 'failed' ||
                    health!.engine?.state === 'unavailable'
                  ? 'AI engine failed — Settings → AI Engine'
                  : 'AI engine unreachable'}
            {health!.lastError ? (
              <span className="rpc-banner-detail"> ({health!.lastError})</span>
            ) : null}
          </div>
        ) : null}

        <div className="app-canvas">
          <ResizablePanelGroup
            ref={panelGroupRef}
            direction="horizontal"
            className="app-layout"
            onLayout={onPanelLayout}
          >
            <ResizablePanel
              id="nav"
              order={1}
              defaultSize={panelLayout[0] ?? DEFAULT_PANEL_LAYOUT[0]}
              minSize={12}
              maxSize={35}
              className="app-gutter app-gutter-left"
            >
          <ScrollArea className="flex-1">
            <nav className="p-[6px]">
              {renderAreaRow(inboxNavArea, { readonly: !inbox })}
              {renderAreaRow(todayArea, { readonly: true })}

              <div className="mt-1 flex h-7 items-center justify-between px-2">
                <span className="text-12 text-muted-foreground">Areas</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label="New area"
                  onClick={async () => {
                    const a = await api.createArea('New Area');
                    setAreas(await api.listAreas());
                    void selectArea(a.id);
                  }}
                >
                  <IconPlusSmall size={16} ariaHidden />
                </Button>
              </div>
              {userAreas.length === 0 ? (
                <p className="px-2 pb-1 text-12 text-muted-foreground">
                  No areas yet
                </p>
              ) : (
                userAreas.map((a) => renderAreaRow(a, { indent: true }))
              )}
            </nav>
          </ScrollArea>
          <div className="flex shrink-0 items-center justify-between border-t border-border px-2 py-1.5">
            <span className="truncate text-12 text-muted-foreground">
              {apiStatus}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label="Settings"
              title="Settings (⌘,)"
              onClick={() => setShowSettings(true)}
            >
              <IconSettingsGear1 size={16} ariaHidden />
            </Button>
          </div>
            </ResizablePanel>

            <ResizableHandle
              className="app-resize-handle"
              onDoubleClick={() => resetAdjacentPanels(0, 1)}
            />

            <ResizablePanel
              id="surface"
              order={2}
              defaultSize={panelLayout[1] ?? DEFAULT_PANEL_LAYOUT[1]}
              minSize={25}
              className="main-surface"
            >
          <ScrollArea className="flex-1">
            {selectedAreaId && !isInboxPlaceholder(selectedAreaId) ? (
              <OutlineTree
                areaId={selectedAreaId}
                selectedId={selectedPointId}
                onSelect={selectPoint}
                refreshKey={refreshKey}
                runningPointIds={runningPointIds}
                onPointsChanged={refresh}
                mode={isTodayView(selectedAreaId) ? 'today' : 'area'}
                since={
                  isTodayView(selectedAreaId) ? todaySince : undefined
                }
                areaNames={areaNames}
                onGoToPoint={
                  isTodayView(selectedAreaId) ? goToPointInArea : undefined
                }
              />
            ) : (
              <p className="px-3 py-12 text-center text-13 text-muted-foreground">
                Select an area
              </p>
            )}
          </ScrollArea>
            </ResizablePanel>

            <ResizableHandle
              className="app-resize-handle"
              onDoubleClick={() => resetAdjacentPanels(1, 2)}
            />

            <ResizablePanel
              id="detail"
              order={3}
              defaultSize={panelLayout[2] ?? DEFAULT_PANEL_LAYOUT[2]}
              minSize={20}
              maxSize={45}
              className="app-gutter app-gutter-right"
            >
          {selectedArea ? (
            selectedPointId ? (
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
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-border px-4 py-3">
                  <h2 className="text-16 font-medium">{selectedArea.name}</h2>
                  <p className="mt-1 text-13 text-muted-foreground">
                    {isTodayView(selectedAreaId)
                      ? 'Tasks you worked on today'
                      : 'Select a task in the outline'}
                  </p>
                </div>
                {!isTodayView(selectedAreaId) ? (
                  <div className="flex-1 p-4">
                    <label className="text-12 text-muted-foreground">
                      Area context
                    </label>
                    <Textarea
                      className="mt-1.5 min-h-[120px] resize-none border-border bg-transparent text-14 shadow-none focus-visible:ring-1"
                      value={areaDescription}
                      onChange={(e) => setAreaDescription(e.target.value)}
                      onBlur={saveAreaDescription}
                      rows={5}
                      placeholder="Shared human/agent context"
                    />
                  </div>
                ) : null}
              </div>
            )
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <p className="text-20 font-medium">Liner</p>
              <p className="mt-2 text-13 text-muted-foreground">
                Select Inbox or Today to begin
              </p>
            </div>
          )}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>

      {showCreator && creatorAreaId ? (
        <TaskCreator
          areaId={creatorAreaId}
          parentId={selectedPointId}
          onCreated={(id) => {
            refresh();
            selectPoint(id);
          }}
          onClose={() => setShowCreator(false)}
        />
      ) : null}

      {showFirstRun && creatorAreaId && !isTodayView(selectedAreaId) ? (
        <FirstRunWizard
          areaId={creatorAreaId}
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
