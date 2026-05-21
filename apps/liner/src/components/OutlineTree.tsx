import * as React from 'react';
import type { Point } from '@liner/core';
import { IconArrowRightCircle } from '@central-icons-react/round-filled-radius-3-stroke-1/IconArrowRightCircle';
import { IconChevronDownSmall } from '@central-icons-react/round-filled-radius-3-stroke-1/IconChevronDownSmall';
import { IconChevronRightSmall } from '@central-icons-react/round-filled-radius-3-stroke-1/IconChevronRightSmall';
import { IconLoader } from '@central-icons-react/round-filled-radius-3-stroke-1/IconLoader';
import { api } from '../api';
import { InlineRename } from './InlineRename';
import { StateBadge } from './state-badge';
import { cn } from '@/lib/utils';

type Props = {
  areaId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  refreshKey: number;
  runningPointIds?: Set<string>;
  onPointsChanged?: () => void;
  mode?: 'area' | 'today';
  since?: string;
  areaNames?: Record<string, string>;
  onGoToPoint?: (point: Point) => void;
};

type VisibleRow = {
  point: Point;
  depth: number;
  parentId: string | null;
  siblings: Point[];
  hasChildren: boolean;
  touched: boolean;
  guides: boolean[];
};

function buildRowGuides(rows: VisibleRow[], index: number): boolean[] {
  const { depth } = rows[index];
  const next = rows[index + 1];
  const guides: boolean[] = [];
  for (let level = 0; level < depth; level++) {
    // Continue the guide through the last child; stop only when the branch ends.
    guides.push(
      next == null || next.depth > level || next.depth < depth,
    );
  }
  return guides;
}

function sortByRecent(points: Point[]): Point[] {
  return [...points].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

function buildAncestorSet(
  selectedId: string | null,
  roots: Point[],
  childrenMap: Record<string, Point[]>,
): Set<string> {
  const ancestors = new Set<string>();
  if (!selectedId) return ancestors;

  const findPath = (
    points: Point[],
    path: string[],
  ): string[] | null => {
    for (const p of points) {
      if (p.id === selectedId) return [...path, p.id];
      const kids = childrenMap[p.id];
      if (kids?.length) {
        const found = findPath(kids, [...path, p.id]);
        if (found) return found;
      }
    }
    return null;
  };

  const path = findPath(roots, []);
  if (path) {
    for (const id of path) ancestors.add(id);
  }
  return ancestors;
}

async function loadTodayTree(since: string): Promise<{
  roots: Point[];
  childrenMap: Record<string, Point[]>;
  touchedIds: Set<string>;
}> {
  const touched = await api.listTodayPoints(since);
  const touchedIds = new Set(touched.map((p) => p.id));
  const byId = new Map(touched.map((p) => [p.id, p]));

  for (const p of touched) {
    let pid = p.parentId;
    while (pid && !byId.has(pid)) {
      const { point } = await api.getPoint(pid);
      byId.set(pid, point);
      pid = point.parentId;
    }
  }

  const childrenMap: Record<string, Point[]> = {};
  for (const p of byId.values()) {
    if (!p.parentId || !byId.has(p.parentId)) continue;
    const parent = byId.get(p.parentId)!;
    const kids =
      childrenMap[p.parentId] ??
      parent.childIds
        .map((id) => byId.get(id))
        .filter((c): c is Point => c !== undefined);
    childrenMap[p.parentId] = kids;
  }

  const roots = sortByRecent(
    [...byId.values()].filter((p) => !p.parentId || !byId.has(p.parentId)),
  );

  for (const id of Object.keys(childrenMap)) {
    childrenMap[id] = sortByRecent(childrenMap[id]);
  }

  return { roots, childrenMap, touchedIds };
}

export function OutlineTree({
  areaId,
  selectedId,
  onSelect,
  refreshKey,
  runningPointIds,
  onPointsChanged,
  mode = 'area',
  since,
  areaNames,
  onGoToPoint,
}: Props) {
  const isToday = mode === 'today';
  const [roots, setRoots] = React.useState<Point[]>([]);
  const [childrenMap, setChildrenMap] = React.useState<Record<string, Point[]>>(
    {},
  );
  const [touchedIds, setTouchedIds] = React.useState<Set<string>>(() => new Set());
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  const [dragOverId, setDragOverId] = React.useState<string | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const dragId = React.useRef<string | null>(null);
  const dragParentId = React.useRef<string | null>(null);

  const reloadRoots = React.useCallback(() => {
    if (isToday && since) {
      void loadTodayTree(since).then(({ roots, childrenMap, touchedIds }) => {
        setRoots(roots);
        setChildrenMap(childrenMap);
        setTouchedIds(touchedIds);
      });
      return;
    }
    api.listPoints(areaId, null).then((list) => {
      setRoots(list);
      setChildrenMap({});
      setTouchedIds(new Set());
    });
  }, [areaId, isToday, since]);

  React.useEffect(() => {
    reloadRoots();
  }, [areaId, refreshKey, reloadRoots]);

  const loadChildren = async (parentId: string) => {
    if (isToday) return;
    const kids = await api.listPoints(areaId, parentId);
    setChildrenMap((m) => ({ ...m, [parentId]: kids }));
  };

  React.useEffect(() => {
    if (isToday) return;
    for (const p of roots) {
      if (p.childIds.length > 0 && !childrenMap[p.id]) {
        void loadChildren(p.id);
      }
    }
  }, [roots, childrenMap, isToday]);

  const reorder = async (
    parentId: string | null,
    orderedIds: string[],
  ) => {
    if (!parentId) {
      setRoots((prev) => {
        const byId = Object.fromEntries(prev.map((p) => [p.id, p]));
        return orderedIds.map((id) => byId[id]).filter(Boolean);
      });
      return;
    }
    await api.reorderChildren(parentId, orderedIds);
    await loadChildren(parentId);
    reloadRoots();
  };

  const toggleCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!isToday && !childrenMap[id]) void loadChildren(id);
  };

  const visibleRows = React.useMemo(() => {
    const rows: VisibleRow[] = [];
    const walk = (
      points: Point[],
      depth: number,
      parentId: string | null,
    ) => {
      for (const point of points) {
        const kids = childrenMap[point.id] ?? [];
        const hasChildren = isToday
          ? kids.length > 0
          : point.childIds.length > 0;
        rows.push({
          point,
          depth,
          parentId,
          siblings: points,
          hasChildren,
          touched: !isToday || touchedIds.has(point.id),
          guides: [],
        });
        if (hasChildren && !collapsed.has(point.id)) {
          walk(kids.length ? kids : [], depth + 1, point.id);
        }
      }
    };
    walk(roots, 0, null);
    return rows.map((row, index) => ({
      ...row,
      guides: buildRowGuides(rows, index),
    }));
  }, [roots, childrenMap, collapsed, isToday, touchedIds]);

  const branchAncestors = React.useMemo(
    () => buildAncestorSet(selectedId, roots, childrenMap),
    [selectedId, roots, childrenMap],
  );

  React.useEffect(() => {
    if (!selectedId) return;
    const idx = visibleRows.findIndex((r) => r.point.id === selectedId);
    if (idx >= 0) setFocusIndex(idx);
  }, [selectedId, visibleRows]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!visibleRows.length) return;

      const focused = visibleRows[focusIndex]?.point;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(focusIndex + 1, visibleRows.length - 1);
        setFocusIndex(next);
        onSelect(visibleRows[next].point.id);
        return;
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = Math.max(focusIndex - 1, 0);
        setFocusIndex(next);
        onSelect(visibleRows[next].point.id);
        return;
      }
      if (e.key === 'ArrowRight' && focused) {
        e.preventDefault();
        if (collapsed.has(focused.id)) {
          setCollapsed((prev) => {
            const next = new Set(prev);
            next.delete(focused.id);
            return next;
          });
          if (!isToday && !childrenMap[focused.id]) void loadChildren(focused.id);
        }
        return;
      }
      if (e.key === 'ArrowLeft' && focused) {
        e.preventDefault();
        if (!collapsed.has(focused.id) && focused.childIds.length > 0) {
          setCollapsed((prev) => new Set(prev).add(focused.id));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visibleRows, focusIndex, collapsed, childrenMap, onSelect, isToday]);

  const onDragStart = (
    e: React.DragEvent,
    point: Point,
    parentId: string | null,
  ) => {
    if (isToday) return;
    dragId.current = point.id;
    dragParentId.current = parentId;
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDropOn = async (
    e: React.DragEvent,
    target: Point,
    siblings: Point[],
    parentId: string | null,
  ) => {
    if (isToday) return;
    e.preventDefault();
    setDragOverId(null);
    const fromId = dragId.current;
    if (!fromId || fromId === target.id) return;
    if (dragParentId.current !== parentId) return;

    const ids = siblings.map((s) => s.id);
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(target.id);
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, fromId);
    await reorder(parentId, ids);
  };

  if (roots.length === 0) {
    return (
      <div className="px-1 pb-1 pt-3">
        <div className="px-2 py-12 text-center text-13 text-muted-foreground">
          <p>{isToday ? 'Nothing worked on yet today' : 'No tasks'}</p>
          {!isToday ? (
            <p className="mt-1 text-12">⌘N to create · j/k to navigate</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="px-1 pb-1 pt-3" role="tree">
      {visibleRows.map((row, index) => {
        const { point, parentId, siblings, hasChildren, touched, guides } = row;
        const branch =
          typeof point.meta?.branch === 'string'
            ? point.meta.branch.trim()
            : '';
        const isSelected = selectedId === point.id;
        const inBranch =
          !selectedId ||
          branchAncestors.has(point.id) ||
          point.id === selectedId;
        const isCollapsed = collapsed.has(point.id);
        const areaLabel = areaNames?.[point.areaId];

        return (
          <div
            key={point.id}
            role="treeitem"
            className={cn(
              'outline-row group flex cursor-pointer items-stretch gap-1 rounded-sm pr-2 pl-2 text-13',
              isSelected && 'bg-accent text-foreground',
              !isSelected && 'text-foreground hover:bg-accent/50',
              dragOverId === point.id && 'bg-muted',
              inBranch && selectedId && 'focused-branch',
              isToday && !touched && 'opacity-60',
            )}
            draggable={!isToday}
            onDragStart={(e) => onDragStart(e, point, parentId)}
            onDragOver={
              isToday
                ? undefined
                : (e) => {
                    e.preventDefault();
                    setDragOverId(point.id);
                  }
            }
            onDragLeave={isToday ? undefined : () => setDragOverId(null)}
            onDrop={
              isToday ? undefined : (e) => onDropOn(e, point, siblings, parentId)
            }
            onClick={() => {
              setFocusIndex(index);
              onSelect(point.id);
              if (!isToday && hasChildren && !childrenMap[point.id]) {
                void loadChildren(point.id);
              }
            }}
            onMouseEnter={() => {
              if (!isToday && hasChildren && !childrenMap[point.id]) {
                void loadChildren(point.id);
              }
            }}
          >
            {guides.map((show, level) => (
              <span
                key={level}
                className="relative w-5 shrink-0 self-stretch"
                aria-hidden
              >
                {show ? <span className="outline-guide" /> : null}
              </span>
            ))}
            <div
              className={cn(
                'outline-row-content flex min-w-0 flex-1 items-center gap-1 py-1.5',
                selectedId && !inBranch && 'dimmed',
              )}
            >
            <span className="flex size-5 shrink-0 items-center justify-center">
              {hasChildren ? (
                <button
                  type="button"
                  className="flex size-5 cursor-pointer items-center justify-center text-foreground/70 hover:text-foreground"
                  aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                  onClick={(e) => toggleCollapse(point.id, e)}
                >
                  {isCollapsed ? (
                    <IconChevronRightSmall size={16} ariaHidden />
                  ) : (
                    <IconChevronDownSmall size={16} ariaHidden />
                  )}
                </button>
              ) : null}
            </span>
            <StateBadge state={point.state} iconOnly />
            <InlineRename
              value={point.task}
              aria-label={`Rename task ${point.task}`}
              className="min-w-0 flex-1"
              onSave={async (task) => {
                await api.updatePoint(point.id, { task });
                reloadRoots();
                if (!isToday && point.parentId) {
                  await loadChildren(point.parentId);
                }
                onPointsChanged?.();
              }}
            />
            {runningPointIds?.has(point.id) ? (
              <IconLoader
                size={12}
                className="shrink-0 animate-spin text-foreground/70"
                aria-label="Agent running"
              />
            ) : null}
            {isToday && areaLabel ? (
              <span
                className="max-w-[80px] shrink-0 truncate rounded-full border-[1.5px] border-border bg-muted/50 px-1.5 py-0.5 text-12 text-muted-foreground"
                title={areaLabel}
              >
                {areaLabel}
              </span>
            ) : null}
            {branch ? (
              <span
                className="max-w-[72px] truncate font-mono text-12 text-muted-foreground"
                title={branch}
              >
                {branch}
              </span>
            ) : null}
            {point.priority !== 'none' ? (
              <span className="text-12 text-muted-foreground capitalize">
                {point.priority}
              </span>
            ) : null}
            {isToday && onGoToPoint ? (
              <button
                type="button"
                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
                aria-label={`Open in ${areaLabel ?? 'area'}`}
                title={`Open in ${areaLabel ?? 'area'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onGoToPoint(point);
                }}
              >
                <IconArrowRightCircle size={14} ariaHidden />
              </button>
            ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
