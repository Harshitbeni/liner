import * as React from 'react';
import type { Point } from '@liner/core';
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
};

type VisibleRow = {
  point: Point;
  depth: number;
  parentId: string | null;
  siblings: Point[];
  hasChildren: boolean;
};

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

export function OutlineTree({
  areaId,
  selectedId,
  onSelect,
  refreshKey,
  runningPointIds,
  onPointsChanged,
}: Props) {
  const [roots, setRoots] = React.useState<Point[]>([]);
  const [childrenMap, setChildrenMap] = React.useState<Record<string, Point[]>>(
    {},
  );
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  const [dragOverId, setDragOverId] = React.useState<string | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const dragId = React.useRef<string | null>(null);
  const dragParentId = React.useRef<string | null>(null);

  const reloadRoots = React.useCallback(() => {
    api.listPoints(areaId, null).then(setRoots);
  }, [areaId]);

  React.useEffect(() => {
    reloadRoots();
  }, [areaId, refreshKey, reloadRoots]);

  const loadChildren = async (parentId: string) => {
    const kids = await api.listPoints(areaId, parentId);
    setChildrenMap((m) => ({ ...m, [parentId]: kids }));
  };

  React.useEffect(() => {
    for (const p of roots) {
      if (p.childIds.length > 0 && !childrenMap[p.id]) {
        void loadChildren(p.id);
      }
    }
  }, [roots, childrenMap]);

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
    if (!childrenMap[id]) void loadChildren(id);
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
        const hasChildren = point.childIds.length > 0;
        rows.push({
          point,
          depth,
          parentId,
          siblings: points,
          hasChildren,
        });
        if (hasChildren && !collapsed.has(point.id)) {
          walk(kids.length ? kids : [], depth + 1, point.id);
        }
      }
    };
    walk(roots, 0, null);
    return rows;
  }, [roots, childrenMap, collapsed]);

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
          if (!childrenMap[focused.id]) void loadChildren(focused.id);
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
  }, [visibleRows, focusIndex, collapsed, childrenMap, onSelect]);

  const onDragStart = (
    e: React.DragEvent,
    point: Point,
    parentId: string | null,
  ) => {
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
      <div className="px-4 py-12 text-center text-13 text-muted-foreground">
        <p>No tasks</p>
        <p className="mt-1 text-12">⌘N to create · j/k to navigate</p>
      </div>
    );
  }

  return (
    <div className="py-1" role="tree">
      {visibleRows.map((row, index) => {
        const { point, depth, parentId, siblings, hasChildren } = row;
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

        return (
          <div
            key={point.id}
            role="treeitem"
            className={cn(
              'outline-row group flex cursor-pointer items-center gap-1 rounded-sm py-1.5 pr-2 text-13',
              isSelected && 'bg-accent text-foreground',
              !isSelected && 'text-foreground hover:bg-accent/50',
              dragOverId === point.id && 'bg-muted',
              selectedId && !inBranch && 'dimmed',
              inBranch && selectedId && 'focused-branch',
            )}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            draggable
            onDragStart={(e) => onDragStart(e, point, parentId)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverId(point.id);
            }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={(e) => onDropOn(e, point, siblings, parentId)}
            onClick={() => {
              setFocusIndex(index);
              onSelect(point.id);
              if (hasChildren && !childrenMap[point.id]) {
                void loadChildren(point.id);
              }
            }}
            onMouseEnter={() => {
              if (hasChildren && !childrenMap[point.id]) {
                void loadChildren(point.id);
              }
            }}
          >
            {hasChildren ? (
              <button
                type="button"
                className="flex size-5 shrink-0 cursor-pointer items-center justify-center text-muted-foreground"
                aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                onClick={(e) => toggleCollapse(point.id, e)}
              >
                {isCollapsed ? (
                  <IconChevronRightSmall size={12} ariaHidden />
                ) : (
                  <IconChevronDownSmall size={12} ariaHidden />
                )}
              </button>
            ) : (
              <span className="size-5 shrink-0" aria-hidden />
            )}
            <InlineRename
              value={point.task}
              aria-label={`Rename task ${point.task}`}
              className="min-w-0 flex-1"
              onSave={async (task) => {
                await api.updatePoint(point.id, { task });
                reloadRoots();
                if (point.parentId) await loadChildren(point.parentId);
                onPointsChanged?.();
              }}
            />
            {runningPointIds?.has(point.id) ? (
              <IconLoader
                size={12}
                className="shrink-0 animate-spin text-muted-foreground"
                aria-label="Agent running"
              />
            ) : null}
            <StateBadge state={point.state} />
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
          </div>
        );
      })}
    </div>
  );
}
