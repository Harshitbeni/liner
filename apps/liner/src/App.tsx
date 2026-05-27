import * as React from 'react';
import type { ImperativePanelGroupHandle } from 'react-resizable-panels';
import type { Area, Point } from '@liner/core';
import { IconPlusSmall } from '@central-icons-react/round-outlined-radius-3-stroke-1.5/IconPlusSmall';
import { IconTrashCan } from '@central-icons-react/round-outlined-radius-3-stroke-1.5/IconTrashCan';
import { IconSettingsGear1 } from '@central-icons-react/round-filled-radius-3-stroke-1.5/IconSettingsGear1';
import { api, type HealthResponse, subscribePointEvents } from './api';
import { useToast } from './toast';
import { OutlineTree } from './components/OutlineTree';
import { DetailSidebarToggle } from './components/DetailSidebarToggle';
import { PointDetail } from './components/PointDetail';
import { FirstRunWizard } from './components/FirstRunWizard';
import { SettingsModal } from './components/SettingsModal';
import { TaskCreator } from './components/TaskCreator';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  isInboxArea,
  isInboxPlaceholder,
  isSmartView,
  isTodayView,
  partitionAreas,
  syntheticInboxArea,
  syntheticTodayArea,
} from '@/lib/areas';
import { TODAY_VIEW_ID, startOfLocalDayIso } from '@/lib/today';
import {
  DETAIL_PANEL_MOTION_MS,
  DEFAULT_INNER_LAYOUT,
  layoutWithDetailCollapsed,
  prefersReducedPanelMotion,
  toInnerLayout,
  toStoredLayout,
} from '@/lib/detail-panel-motion';
import { cn } from '@/lib/utils';
import {
  DEFAULT_PANEL_LAYOUT,
  loadLayoutSizes,
  loadOnboarded,
  loadSelectedAreaId,
  loadSelectedPointId,
  markOnboarded,
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
  const [onboarded, setOnboarded] = React.useState(() => loadOnboarded());
  const [areaProgress, setAreaProgress] = React.useState<
    Record<string, AreaProgress>
  >({});
  const [defaultAreaId, setDefaultAreaId] = React.useState<string | null>(null);
  const [deleteAreaConfirmOpen, setDeleteAreaConfirmOpen] =
    React.useState(false);
  const [pendingDeleteArea, setPendingDeleteArea] = React.useState<Area | null>(
    null,
  );
  const todaySince = React.useMemo(() => startOfLocalDayIso(), [refreshKey]);
  const [panelLayout, setPanelLayout] = React.useState<number[]>(() =>
    loadLayoutSizes(),
  );
  const outerPanelGroupRef = React.useRef<ImperativePanelGroupHandle>(null);
  const innerPanelGroupRef = React.useRef<ImperativePanelGroupHandle>(null);
  const panelLayoutAnimatingRef = React.useRef(false);
  const innerLayout = React.useMemo(() => toInnerLayout(panelLayout), [panelLayout]);
  const lastDetailSizeRef = React.useRef(innerLayout[1]);
  const [detailCollapsed, setDetailCollapsed] = React.useState(
    () => innerLayout[1] < 0.5,
  );
  const [panelLayoutAnimating, setPanelLayoutAnimating] = React.useState(false);
  const [panelClosing, setPanelClosing] = React.useState(false);

  const animateDetailPanel = React.useCallback((collapsed: boolean) => {
    const inner = innerPanelGroupRef.current;
    if (!inner) return;

    const current = inner.getLayout();
    if (!collapsed && current[1] > 0) {
      lastDetailSizeRef.current = current[1];
    }

    const target = layoutWithDetailCollapsed(
      current,
      collapsed,
      lastDetailSizeRef.current,
    );
    const duration = prefersReducedPanelMotion() ? 0 : DETAIL_PANEL_MOTION_MS;

    const commit = (innerSizes: number[]) => {
      const nav =
        outerPanelGroupRef.current?.getLayout()[0] ?? panelLayout[0];
      const stored = toStoredLayout(nav, [innerSizes[0], innerSizes[1]]);
      setPanelLayout(stored);
      saveLayoutSizes(stored);
      if (!collapsed && innerSizes[1] > 0) {
        lastDetailSizeRef.current = innerSizes[1];
      }
    };

    if (duration === 0) {
      inner.setLayout(target);
      setDetailCollapsed(collapsed);
      commit(target);
      return;
    }

    panelLayoutAnimatingRef.current = true;
    setPanelLayoutAnimating(true);
    setPanelClosing(collapsed);
    setDetailCollapsed(collapsed);
    inner.setLayout(target);

    window.setTimeout(() => {
      panelLayoutAnimatingRef.current = false;
      setPanelLayoutAnimating(false);
      setPanelClosing(false);
      commit(inner.getLayout());
    }, duration);
  }, [panelLayout]);

  const toggleDetailSidebar = React.useCallback(() => {
    animateDetailPanel(!detailCollapsed);
  }, [animateDetailPanel, detailCollapsed]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const onOuterPanelLayout = React.useCallback(
    (sizes: number[]) => {
      const inner =
        innerPanelGroupRef.current?.getLayout() ?? innerLayout;
      const stored = toStoredLayout(sizes[0], [inner[0], inner[1]]);
      setPanelLayout(stored);
      if (!panelLayoutAnimatingRef.current) {
        saveLayoutSizes(stored);
      }
    },
    [innerLayout],
  );

  const onInnerPanelLayout = React.useCallback(
    (sizes: number[]) => {
      const nav =
        outerPanelGroupRef.current?.getLayout()[0] ?? panelLayout[0];
      const stored = toStoredLayout(nav, [sizes[0], sizes[1]]);
      setPanelLayout(stored);
      if (!panelLayoutAnimatingRef.current) {
        saveLayoutSizes(stored);
        if (sizes[1] > 0) lastDetailSizeRef.current = sizes[1];
        setDetailCollapsed(sizes[1] < 0.5);
      }
    },
    [panelLayout],
  );

  const resetNavWorkspace = React.useCallback(() => {
    const nav = DEFAULT_PANEL_LAYOUT[0];
    const workspace = 100 - nav;
    outerPanelGroupRef.current?.setLayout([nav, workspace]);
    const inner =
      innerPanelGroupRef.current?.getLayout() ?? innerLayout;
    const stored = toStoredLayout(nav, [inner[0], inner[1]]);
    setPanelLayout(stored);
    saveLayoutSizes(stored);
  }, [innerLayout]);

  const resetSurfaceDetail = React.useCallback(() => {
    innerPanelGroupRef.current?.setLayout([...DEFAULT_INNER_LAYOUT]);
    const nav =
      outerPanelGroupRef.current?.getLayout()[0] ?? panelLayout[0];
    const stored = toStoredLayout(nav, [...DEFAULT_INNER_LAYOUT]);
    setPanelLayout(stored);
    saveLayoutSizes(stored);
  }, [panelLayout]);

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
  const onboardingAreaId = defaultAreaId ?? inbox?.id ?? null;
  const needsOnboarding = !onboarded && onboardingAreaId !== null;

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

  const performDeleteArea = React.useCallback(
    async (area: Area) => {
      await api.deleteArea(area.id);
      const list = await api.listAreas();
      setAreas(list);
      if (selectedAreaId === area.id) {
        const { inbox, userAreas: remaining } = partitionAreas(list);
        if (inbox) {
          void selectArea(inbox.id);
        } else if (remaining[0]) {
          void selectArea(remaining[0].id);
        } else {
          void selectArea(TODAY_VIEW_ID);
        }
      }
      setRefreshKey((k) => k + 1);
    },
    [selectArea, selectedAreaId],
  );

  const renderAreaRow = (
    a: Area,
    options?: { readonly?: boolean; indent?: boolean; deletable?: boolean },
  ) => {
    const todayRow = isTodayView(a.id);
    const deletable =
      options?.deletable ??
      (!options?.readonly &&
        !isSmartView(a.id) &&
        !isInboxArea(a));
    return (
      <div
        key={a.id}
        className={cn(
          'group mb-px flex w-full items-center gap-0.5 py-1.5 pr-2 transition-colors',
          todayRow ? 'pl-[8px]' : 'pl-[6px]',
          todayRow || options?.indent ? 'rounded-[6px]' : 'rounded-full',
          selectedAreaId === a.id
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-13 text-inherit outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
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
            <span className="min-w-0 flex-1 truncate">{a.name}</span>
          ) : (
            <InlineRename
              value={a.name}
              aria-label={`Rename area ${a.name}`}
              className="min-w-0 flex-1"
              onSave={async (name) => {
                await api.updateArea(a.id, { name });
                setAreas(await api.listAreas());
              }}
            />
          )}
        </button>
        {deletable ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                aria-label="Delete Area"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDeleteArea(a);
                  setDeleteAreaConfirmOpen(true);
                }}
              >
                <IconTrashCan size={14} ariaHidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete Area</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    );
  };

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
      <Dialog
        open={deleteAreaConfirmOpen}
        onOpenChange={(open) => {
          setDeleteAreaConfirmOpen(open);
          if (!open) setPendingDeleteArea(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete area?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {pendingDeleteArea
              ? `${pendingDeleteArea.name} and all tasks in it will be removed permanently.`
              : 'This area and all tasks in it will be removed permanently.'}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteAreaConfirmOpen(false);
                setPendingDeleteArea(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!pendingDeleteArea}
              onClick={() => {
                const area = pendingDeleteArea;
                setDeleteAreaConfirmOpen(false);
                setPendingDeleteArea(null);
                if (area) void performDeleteArea(area);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="app-frame">
        {showRpcBanner ? (
          <div className="rpc-banner" role="status">
            {packaged
              ? health!.engine?.state === 'failed'
                ? 'Cursor SDK failed — Settings → Cursor SDK'
                : health!.rpc === 'mock' || health!.engine?.state === 'mock-fallback'
                  ? 'Demo mode — Settings → Cursor SDK'
                  : 'Cursor SDK not ready'
              : health!.rpc === 'mock'
                ? 'Mock RPC — demo mode (add Cursor API key for live Composer 2.5 agents)'
                : health!.engine?.state === 'failed' ||
                    health!.engine?.state === 'unavailable'
                  ? 'Cursor SDK failed — Settings → Cursor SDK'
                  : 'Cursor SDK unreachable'}
            {health!.lastError ? (
              <span className="rpc-banner-detail"> ({health!.lastError})</span>
            ) : null}
          </div>
        ) : null}

        <div className="app-canvas">
          <ResizablePanelGroup
            ref={outerPanelGroupRef}
            direction="horizontal"
            className="app-layout"
            onLayout={onOuterPanelLayout}
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
            <nav className="px-[6px] pb-[6px] pt-[12px]">
              {renderAreaRow(inboxNavArea, { readonly: !inbox })}
              {renderAreaRow(todayArea, { readonly: true })}

              <div
                className="mx-2 my-2 h-px bg-border/80"
                role="separator"
                aria-hidden
              />
              {userAreas.map((a) =>
                renderAreaRow(a, { indent: true, deletable: true }),
              )}
              <button
                type="button"
                className="mb-px flex w-full cursor-pointer items-center gap-2 rounded-[6px] py-1.5 pr-2 pl-[6px] text-left text-13 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="New area"
                onClick={async () => {
                  const a = await api.createArea('New Area');
                  setAreas(await api.listAreas());
                  void selectArea(a.id);
                }}
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  <IconPlusSmall size={16} ariaHidden />
                </span>
                <span className="flex-1 truncate">New Area</span>
              </button>
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
              onDoubleClick={resetNavWorkspace}
            />

            <ResizablePanel
              id="workspace"
              order={2}
              defaultSize={
                (panelLayout[1] ?? DEFAULT_PANEL_LAYOUT[1]) +
                (panelLayout[2] ?? DEFAULT_PANEL_LAYOUT[2])
              }
              minSize={40}
              className="flex min-h-0 min-w-0 flex-col"
            >
              <ResizablePanelGroup
                ref={innerPanelGroupRef}
                direction="horizontal"
                className={cn(
                  'h-full min-h-0',
                  panelLayoutAnimating && 'app-layout--panel-animating',
                  panelClosing && 'app-layout--panel-closing',
                )}
                onLayout={onInnerPanelLayout}
              >
            <ResizablePanel
              id="surface"
              order={1}
              defaultSize={innerLayout[0]}
              minSize={25}
              className={cn(
                'main-surface relative',
                detailCollapsed && 'mr-2',
              )}
            >
          {detailCollapsed && !panelLayoutAnimating ? (
            <DetailSidebarToggle
              collapsed
              floating
              onToggle={toggleDetailSidebar}
              className="absolute top-2 right-2 z-10"
            />
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col">
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
              <p className="flex flex-1 items-center justify-center px-3 text-center text-13 text-muted-foreground">
                Select an area
              </p>
            )}
          </div>
            </ResizablePanel>

            {(!detailCollapsed || panelLayoutAnimating) ? (
              <ResizableHandle
                className="app-resize-handle"
                onDoubleClick={resetSurfaceDetail}
              />
            ) : null}

            <ResizablePanel
              id="detail"
              order={2}
              defaultSize={innerLayout[1]}
              minSize={20}
              maxSize={45}
              collapsible
              collapsedSize={0}
              onCollapse={() => {
                setDetailCollapsed(true);
                lastDetailSizeRef.current =
                  innerPanelGroupRef.current?.getLayout()[1] ??
                  lastDetailSizeRef.current;
              }}
              onExpand={() => setDetailCollapsed(false)}
              className="app-gutter app-gutter-right"
            >
          {selectedArea ? (
            selectedPointId ? (
              <PointDetail
                pointId={selectedPointId}
                onUpdated={refresh}
                onNewPoint={() => setShowCreator(true)}
                detailCollapsed={detailCollapsed}
                onToggleDetailSidebar={toggleDetailSidebar}
                onStateNotice={(from, to, actor) =>
                  showToast(
                    `${actor}: ${from.replace(/-/g, ' ')} → ${to.replace(/-/g, ' ')}`,
                  )
                }
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-start gap-0.5 border-b border-border px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-16 font-medium">{selectedArea.name}</h2>
                    <p className="mt-1 text-13 text-muted-foreground">
                      {isTodayView(selectedAreaId)
                        ? 'Tasks you worked on today'
                        : 'Select a task in the outline'}
                    </p>
                  </div>
                  {!detailCollapsed ? (
                    <DetailSidebarToggle
                      collapsed={false}
                      onToggle={toggleDetailSidebar}
                    />
                  ) : null}
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

      {needsOnboarding && onboardingAreaId ? (
        <FirstRunWizard
          open={needsOnboarding}
          areaId={onboardingAreaId}
          initialName={
            areas.find((a) => a.id === onboardingAreaId)?.name ?? 'Inbox'
          }
          onComplete={() => {
            markOnboarded();
            setOnboarded(true);
            void api.listAreas().then(setAreas);
            refresh();
          }}
          onDismiss={() => {
            markOnboarded();
            setOnboarded(true);
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
