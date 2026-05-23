import * as React from 'react';
import type { Point } from '@liner/core';
import { IconArrowRightCircle } from '@central-icons-react/round-filled-radius-3-stroke-1/IconArrowRightCircle';
import { IconChevronDownSmall } from '@central-icons-react/round-filled-radius-3-stroke-1/IconChevronDownSmall';
import { IconChevronRightSmall } from '@central-icons-react/round-filled-radius-3-stroke-1/IconChevronRightSmall';
import { IconLoader } from '@central-icons-react/round-filled-radius-3-stroke-1/IconLoader';
import { api } from '../api';
import { InlineRename } from './InlineRename';
import { StateBadge } from './state-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type Props = {
  areaId: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
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

function findPoint(
  id: string,
  roots: Point[],
  childrenMap: Record<string, Point[]>,
): Point | undefined {
  for (const p of roots) {
    if (p.id === id) return p;
  }
  for (const kids of Object.values(childrenMap)) {
    const found = kids.find((p) => p.id === id);
    if (found) return found;
  }
  return undefined;
}

function collectVisibleSubtreeIds(
  pointId: string,
  visibleRows: VisibleRow[],
): string[] {
  const startIdx = visibleRows.findIndex((r) => r.point.id === pointId);
  if (startIdx < 0) return [];
  const startDepth = visibleRows[startIdx].depth;
  const ids: string[] = [];
  for (let i = startIdx; i < visibleRows.length; i++) {
    const row = visibleRows[i];
    if (i > startIdx && row.depth <= startDepth) break;
    ids.push(row.point.id);
  }
  return ids;
}

function patchChildrenMapAfterMove(
  moved: Point,
  pointId: string,
  oldParentId: string | null,
  parentId: string | null,
  afterId: string | null | undefined,
  roots: Point[],
  childrenMap: Record<string, Point[]>,
): { roots: Point[]; childrenMap: Record<string, Point[]> } {
  const nextMap = { ...childrenMap };

  if (oldParentId) {
    const oldKids = nextMap[oldParentId];
    if (oldKids) {
      nextMap[oldParentId] = oldKids.filter((c) => c.id !== pointId);
    }
  }

  let nextRoots = roots;
  if (oldParentId === null) {
    nextRoots = roots.filter((p) => p.id !== pointId);
  }

  if (parentId === null) {
    const list = [...nextRoots].filter((p) => p.id !== pointId);
    if (afterId != null) {
      const idx = list.findIndex((p) => p.id === afterId);
      const at = idx < 0 ? list.length : idx + 1;
      list.splice(at, 0, moved);
    } else {
      list.push(moved);
    }
    nextRoots = list;
  } else {
    const siblings = [...(nextMap[parentId] ?? [])].filter((c) => c.id !== pointId);
    if (afterId != null) {
      const idx = siblings.findIndex((c) => c.id === afterId);
      const at = idx < 0 ? siblings.length : idx + 1;
      siblings.splice(at, 0, moved);
    } else {
      siblings.push(moved);
    }
    nextMap[parentId] = siblings;
  }

  return { roots: nextRoots, childrenMap: nextMap };
}

function isDescendantOf(
  id: string,
  ancestorId: string,
  roots: Point[],
  childrenMap: Record<string, Point[]>,
): boolean {
  let current = findPoint(id, roots, childrenMap);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = findPoint(current.parentId, roots, childrenMap);
  }
  return false;
}

function topLevelDeleteIds(
  ids: string[],
  roots: Point[],
  childrenMap: Record<string, Point[]>,
): string[] {
  if (ids.length <= 1) return ids;
  return ids.filter(
    (id) =>
      !ids.some(
        (other) => other !== id && isDescendantOf(id, other, roots, childrenMap),
      ),
  );
}

function collectAllRemovedIds(
  ids: string[],
  roots: Point[],
  childrenMap: Record<string, Point[]>,
): Set<string> {
  const removed = new Set<string>();
  for (const id of ids) {
    removed.add(id);
    for (const desc of collectDescendantIds(id, roots, childrenMap)) {
      removed.add(desc);
    }
  }
  return removed;
}

/** Drop deleted points from roots and parent child lists (childrenMap keys are parent ids). */
function applyRemovedPointsToTree(
  roots: Point[],
  childrenMap: Record<string, Point[]>,
  removedIds: Set<string>,
): { roots: Point[]; childrenMap: Record<string, Point[]> } {
  const stripChildIds = (p: Point): Point => ({
    ...p,
    childIds: p.childIds.filter((id) => !removedIds.has(id)),
  });

  const nextRoots = roots
    .filter((p) => !removedIds.has(p.id))
    .map(stripChildIds);

  const nextMap: Record<string, Point[]> = {};
  for (const [parentId, kids] of Object.entries(childrenMap)) {
    if (removedIds.has(parentId)) continue;
    const filtered = kids
      .filter((c) => !removedIds.has(c.id))
      .map(stripChildIds);
    if (filtered.length > 0) nextMap[parentId] = filtered;
  }

  return { roots: nextRoots, childrenMap: nextMap };
}

function pickNeighborAfterDelete(
  visibleRows: VisibleRow[],
  focusIndex: number,
  removedIds: Set<string>,
): { primaryId: string | null; focusIdx: number } {
  const start = Math.min(focusIndex, visibleRows.length - 1);
  for (let i = start; i >= 0; i--) {
    const id = visibleRows[i]?.point.id;
    if (id && !removedIds.has(id)) return { primaryId: id, focusIdx: i };
  }
  for (let i = start + 1; i < visibleRows.length; i++) {
    const id = visibleRows[i]?.point.id;
    if (id && !removedIds.has(id)) return { primaryId: id, focusIdx: i };
  }
  return { primaryId: null, focusIdx: 0 };
}

function collectDescendantIds(
  pointId: string,
  roots: Point[],
  childrenMap: Record<string, Point[]>,
): string[] {
  const point = findPoint(pointId, roots, childrenMap);
  if (!point) return [];

  const ids: string[] = [];
  const walk = (parent: Point) => {
    const childIds =
      childrenMap[parent.id]?.map((c) => c.id) ?? parent.childIds;
    for (const id of childIds) {
      ids.push(id);
      const child = findPoint(id, roots, childrenMap);
      if (child) walk(child);
    }
  };
  walk(point);
  return ids;
}

async function ensureSubtreeLoaded(
  areaId: string,
  rootId: string,
  roots: Point[],
  childrenMap: Record<string, Point[]>,
  setChildrenMap: React.Dispatch<
    React.SetStateAction<Record<string, Point[]>>
  >,
): Promise<void> {
  const map = { ...childrenMap };
  const queue = [rootId];
  const loaded: Record<string, Point[]> = {};

  while (queue.length) {
    const id = queue.shift()!;
    const point = findPoint(id, roots, map);
    if (!point?.childIds.length) continue;

    if (!map[id]) {
      const kids = await api.listPoints(areaId, id);
      map[id] = kids;
      loaded[id] = kids;
    }
    for (const kid of map[id]) {
      if (kid.childIds.length > 0) queue.push(kid.id);
    }
  }

  if (Object.keys(loaded).length > 0) {
    setChildrenMap((m) => ({ ...m, ...loaded }));
  }
}

type MultiSelectRadiusRole = 'single' | 'start' | 'end' | 'middle';

/** Contiguous runs in `visibleRows` for multi-select row corner styling. */
function buildMultiSelectRadiusRoles(
  rows: VisibleRow[],
  selected: Set<string>,
): Map<string, MultiSelectRadiusRole> {
  const roles = new Map<string, MultiSelectRadiusRole>();
  if (selected.size < 2) return roles;

  let runStart = -1;
  const flushRun = (runEnd: number) => {
    if (runStart < 0) return;
    const len = runEnd - runStart + 1;
    for (let i = runStart; i <= runEnd; i++) {
      const id = rows[i].point.id;
      if (len === 1) roles.set(id, 'single');
      else if (i === runStart) roles.set(id, 'start');
      else if (i === runEnd) roles.set(id, 'end');
      else roles.set(id, 'middle');
    }
    runStart = -1;
  };

  for (let i = 0; i < rows.length; i++) {
    if (selected.has(rows[i].point.id)) {
      if (runStart < 0) runStart = i;
    } else if (runStart >= 0) {
      flushRun(i - 1);
    }
  }
  if (runStart >= 0) flushRun(rows.length - 1);
  return roles;
}

function idsInVisibleRange(
  rows: VisibleRow[],
  anchorIndex: number,
  endIndex: number,
): string[] {
  const lo = Math.min(anchorIndex, endIndex);
  const hi = Math.max(anchorIndex, endIndex);
  const ids: string[] = [];
  for (let i = lo; i <= hi; i++) {
    ids.push(rows[i].point.id);
  }
  return ids;
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
  refreshKey: _refreshKey,
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
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [renamingPointId, setRenamingPointId] = React.useState<string | null>(
    null,
  );
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = React.useState<string[]>([]);
  const selectionAnchorRef = React.useRef(0);
  const skipSelectionSyncRef = React.useRef(false);
  const dragId = React.useRef<string | null>(null);
  const dragParentId = React.useRef<string | null>(null);

  const applySelection = React.useCallback(
    (
      ids: string[],
      primaryId: string,
      focusIdx: number,
      moveAnchor = true,
    ) => {
      skipSelectionSyncRef.current = ids.length > 1;
      setSelectedIds(new Set(ids));
      if (moveAnchor) selectionAnchorRef.current = focusIdx;
      setFocusIndex(focusIdx);
      onSelect(primaryId);
    },
    [onSelect],
  );

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
    });
  }, [areaId, isToday, since]);

  React.useEffect(() => {
    setChildrenMap({});
    setCollapsed(new Set());
    setTouchedIds(new Set());
  }, [areaId]);

  React.useEffect(() => {
    reloadRoots();
  }, [areaId, reloadRoots]);

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

  const isRowCollapsed = (id: string, hasChildren: boolean) =>
    collapsed.has(id) ||
    (!isToday && hasChildren && !childrenMap[id]);

  const applyMove = React.useCallback(
    async (
      pointId: string,
      parentId: string | null,
      afterId: string | null | undefined,
      expandIds: string[],
      oldParentId: string | null,
      preserveExpandedIds: string[] = [],
    ) => {
      const idsToExpand = expandIds.filter((id) => {
        const point = findPoint(id, roots, childrenMap);
        if (!point) return false;
        const kids = childrenMap[id] ?? [];
        const hasChildren = isToday
          ? kids.length > 0
          : point.childIds.length > 0;
        return isRowCollapsed(id, hasChildren);
      });

      if (idsToExpand.length > 0) {
        setCollapsed((prev) => {
          const next = new Set(prev);
          for (const id of idsToExpand) next.delete(id);
          return next;
        });
        if (!isToday) {
          for (const id of idsToExpand) {
            if (!childrenMap[id]) void loadChildren(id);
          }
        }
      }

      const moved = await api.movePoint(pointId, { parentId, afterId });

      if (isToday && since) {
        const tree = await loadTodayTree(since);
        setRoots(tree.roots);
        setChildrenMap(tree.childrenMap);
        setTouchedIds(tree.touchedIds);
      } else {
        const patched = patchChildrenMapAfterMove(
          moved,
          pointId,
          oldParentId,
          parentId,
          afterId,
          roots,
          childrenMap,
        );
        setRoots(patched.roots);
        setChildrenMap(patched.childrenMap);

        if (preserveExpandedIds.length > 0) {
          setCollapsed((prev) => {
            const next = new Set(prev);
            for (const id of preserveExpandedIds) next.delete(id);
            return next;
          });
        }

        const parentsToReload = new Set<string>();
        if (parentId) parentsToReload.add(parentId);
        if (oldParentId) parentsToReload.add(oldParentId);
        void Promise.all([...parentsToReload].map((id) => loadChildren(id)));
      }

      onSelect(pointId);
    },
    [roots, childrenMap, collapsed, isToday, since, areaId, loadChildren, onSelect],
  );

  const toggleCollapse = (
    id: string,
    hasChildren: boolean,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    const wasCollapsed = isRowCollapsed(id, hasChildren);
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (wasCollapsed) next.delete(id);
      else next.add(id);
      return next;
    });
    if (wasCollapsed && !isToday && !childrenMap[id]) void loadChildren(id);
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
        if (hasChildren && !isRowCollapsed(point.id, hasChildren)) {
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

  const selectSingle = React.useCallback(
    (index: number) => {
      const id = visibleRows[index]?.point.id;
      if (!id) return;
      applySelection([id], id, index);
    },
    [visibleRows, applySelection],
  );

  const extendSelectionTo = React.useCallback(
    (index: number, primaryId?: string) => {
      const row = visibleRows[index];
      if (!row) return;
      const ids = idsInVisibleRange(
        visibleRows,
        selectionAnchorRef.current,
        index,
      );
      applySelection(ids, primaryId ?? row.point.id, index, false);
    },
    [visibleRows, applySelection],
  );

  const multiSelect = selectedIds.size > 1;

  const multiSelectRadiusRoles = React.useMemo(
    () => buildMultiSelectRadiusRoles(visibleRows, selectedIds),
    [visibleRows, selectedIds],
  );

  /** Opt+N: child of primary selection (`selectedId`); order uses keyboard-focused row. */
  const selectedIdsForDelete = React.useCallback((): string[] => {
    if (selectedIds.size > 0) return [...selectedIds];
    if (selectedId) return [selectedId];
    return [];
  }, [selectedIds, selectedId]);

  const performDelete = React.useCallback(
    async (rawIds: string[]) => {
      if (isToday || rawIds.length === 0) return;

      const topLevel = topLevelDeleteIds(rawIds, roots, childrenMap);
      const removedIds = collectAllRemovedIds(topLevel, roots, childrenMap);
      const { primaryId, focusIdx } = pickNeighborAfterDelete(
        visibleRows,
        focusIndex,
        removedIds,
      );

      for (const id of topLevel) {
        await api.deletePoint(id);
      }

      const pruned = applyRemovedPointsToTree(roots, childrenMap, removedIds);
      setRoots(pruned.roots);
      setChildrenMap(pruned.childrenMap);

      if (primaryId) {
        applySelection([primaryId], primaryId, focusIdx);
      } else {
        skipSelectionSyncRef.current = true;
        setSelectedIds(new Set());
        setFocusIndex(0);
        onSelect(null);
      }

      onPointsChanged?.();
    },
    [
      isToday,
      roots,
      childrenMap,
      visibleRows,
      focusIndex,
      applySelection,
      onSelect,
      onPointsChanged,
    ],
  );

  const quickCreateChild = React.useCallback(async () => {
    if (isToday || !selectedId) return;

    const parentId = selectedId;
    const parent = findPoint(parentId, roots, childrenMap);
    if (!parent) return;

    const focusedRow = visibleRows[focusIndex];
    const afterSiblingId =
      focusedRow?.parentId === parentId ? focusedRow.point.id : null;
    const insertFirst =
      afterSiblingId == null &&
      (focusedRow?.point.id === parentId ||
        (childrenMap[parentId]?.length ?? parent.childIds.length) === 0);

    const hasChildren = parent.childIds.length > 0;
    if (isRowCollapsed(parentId, hasChildren)) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(parentId);
        return next;
      });
      if (!childrenMap[parentId]) await loadChildren(parentId);
    }

    const point = await api.createPoint({
      task: 'Untitled',
      areaId,
      parentId,
    });

    if (afterSiblingId) {
      await api.movePoint(point.id, { parentId, afterId: afterSiblingId });
    } else if (
      insertFirst &&
      (childrenMap[parentId]?.length ?? parent.childIds.length) > 0
    ) {
      const kids = await api.listPoints(areaId, parentId);
      await api.reorderChildren(parentId, [
        point.id,
        ...kids.filter((c) => c.id !== point.id).map((c) => c.id),
      ]);
    }

    const kids = await api.listPoints(areaId, parentId);
    setChildrenMap((m) => ({ ...m, [parentId]: kids }));

    let idx = focusIndex;
    if (afterSiblingId) {
      const sibIdx = visibleRows.findIndex((r) => r.point.id === afterSiblingId);
      if (sibIdx >= 0) idx = sibIdx + 1;
    } else {
      const parentIdx = visibleRows.findIndex((r) => r.point.id === parentId);
      if (parentIdx >= 0) idx = parentIdx + 1;
    }

    applySelection([point.id], point.id, idx);
    setRenamingPointId(point.id);
    reloadRoots();
    onPointsChanged?.();
  }, [
    isToday,
    selectedId,
    roots,
    childrenMap,
    visibleRows,
    focusIndex,
    areaId,
    collapsed,
    applySelection,
    reloadRoots,
    onPointsChanged,
  ]);

  const branchAncestors = React.useMemo(
    () => buildAncestorSet(selectedId, roots, childrenMap),
    [selectedId, roots, childrenMap],
  );

  React.useEffect(() => {
    if (skipSelectionSyncRef.current) {
      skipSelectionSyncRef.current = false;
      return;
    }
    if (!selectedId) {
      setSelectedIds(new Set());
      return;
    }
    const idx = visibleRows.findIndex((r) => r.point.id === selectedId);
    if (idx >= 0) {
      setFocusIndex(idx);
      selectionAnchorRef.current = idx;
    }
    setSelectedIds((prev) => {
      if (prev.size === 1 && prev.has(selectedId)) return prev;
      return new Set([selectedId]);
    });
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
        if (e.shiftKey) extendSelectionTo(next);
        else selectSingle(next);
        return;
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = Math.max(focusIndex - 1, 0);
        if (e.shiftKey) extendSelectionTo(next);
        else selectSingle(next);
        return;
      }
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === 'ArrowRight' && focused) {
        e.preventDefault();
        const descendantIds = collectDescendantIds(
          focused.id,
          roots,
          childrenMap,
        );
        setCollapsed((prev) => {
          const next = new Set(prev);
          next.delete(focused.id);
          for (const id of descendantIds) next.delete(id);
          return next;
        });
        if (!isToday) {
          void ensureSubtreeLoaded(
            areaId,
            focused.id,
            roots,
            childrenMap,
            setChildrenMap,
          );
        }
        return;
      }
      if (mod && e.key === 'ArrowLeft' && focused) {
        e.preventDefault();
        const descendantIds = collectDescendantIds(
          focused.id,
          roots,
          childrenMap,
        );
        setCollapsed((prev) => {
          const next = new Set(prev);
          next.add(focused.id);
          for (const id of descendantIds) next.add(id);
          return next;
        });
        return;
      }

      if (e.key === 'ArrowRight' && focused) {
        e.preventDefault();
        const hasKids = focused.childIds.length > 0;
        if (isRowCollapsed(focused.id, hasKids)) {
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
        const hasKids = focused.childIds.length > 0;
        if (!isRowCollapsed(focused.id, hasKids)) {
          setCollapsed((prev) => new Set(prev).add(focused.id));
        }
        return;
      }

      if (isToday) return;

      const isDeleteKey = e.key === 'Delete' || e.key === 'Backspace';
      if (isDeleteKey && !e.altKey && !e.shiftKey) {
        if (renamingPointId) return;
        const ids = selectedIdsForDelete();
        if (!ids.length) return;
        e.preventDefault();
        if (mod) {
          void performDelete(ids);
        } else {
          setPendingDeleteIds(ids);
          setDeleteConfirmOpen(true);
        }
        return;
      }

      // macOS Option+N often yields a dead/special `key`; `code` stays KeyN.
      if (e.altKey && !mod && e.code === 'KeyN') {
        if (!selectedId) return;
        e.preventDefault();
        void quickCreateChild();
        return;
      }

      const row = visibleRows[focusIndex];
      if (!row) return;

      if (e.key === 'Tab' && !e.shiftKey) {
        const sibIdx = row.siblings.findIndex((s) => s.id === row.point.id);
        if (sibIdx <= 0) return;
        e.preventDefault();
        const prevSibling = row.siblings[sibIdx - 1];
        const preserveExpandedIds = collectVisibleSubtreeIds(
          row.point.id,
          visibleRows,
        );
        void applyMove(
          row.point.id,
          prevSibling.id,
          undefined,
          [prevSibling.id],
          row.parentId,
          preserveExpandedIds,
        );
        return;
      }

      if (e.key === 'Tab' && e.shiftKey) {
        if (!row.parentId) return;
        e.preventDefault();
        const preserveExpandedIds = collectVisibleSubtreeIds(
          row.point.id,
          visibleRows,
        );
        void (async () => {
          const { point: parent } = await api.getPoint(row.parentId!);
          await applyMove(
            row.point.id,
            parent.parentId,
            parent.id,
            [parent.id, ...(parent.parentId ? [parent.parentId] : [])],
            row.parentId,
            preserveExpandedIds,
          );
        })();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    visibleRows,
    focusIndex,
    collapsed,
    childrenMap,
    roots,
    areaId,
    selectSingle,
    extendSelectionTo,
    isToday,
    applyMove,
    selectedId,
    quickCreateChild,
    renamingPointId,
    selectedIdsForDelete,
    performDelete,
  ]);

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
      <div className="px-1 pb-1 pt-[4px]">
        <div className="px-2 py-12 text-center text-13 text-muted-foreground">
          <p>{isToday ? 'Nothing worked on yet today' : 'No tasks'}</p>
          {!isToday ? (
            <p className="mt-1 text-12">
              ⌘N new task · ⌥N child · j/k navigate · Delete remove · ⌘Delete
              remove without confirm
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const deleteCount = pendingDeleteIds.length;
  const deletePreview =
    deleteCount === 1
      ? (findPoint(pendingDeleteIds[0]!, roots, childrenMap)?.task ?? 'this task')
      : `${deleteCount} tasks`;

  return (
    <>
      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) setPendingDeleteIds([]);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deleteCount === 1 ? 'Delete task?' : `Delete ${deleteCount} tasks?`}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteCount === 1
              ? `“${deletePreview}” will be removed permanently, including any subtasks.`
              : `${deletePreview} will be removed permanently, including any subtasks.`}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setPendingDeleteIds([]);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const ids = pendingDeleteIds;
                setDeleteConfirmOpen(false);
                setPendingDeleteIds([]);
                void performDelete(ids);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="px-1 pb-1 pt-[4px]" role="tree">
      {visibleRows.map((row, index) => {
        const { point, parentId, siblings, hasChildren, touched, guides } = row;
        const branch =
          typeof point.meta?.branch === 'string'
            ? point.meta.branch.trim()
            : '';
        const isInSelection = selectedIds.has(point.id);
        const multiSelectRadiusRole = multiSelectRadiusRoles.get(point.id);
        const inBranch =
          !selectedId ||
          multiSelect ||
          branchAncestors.has(point.id) ||
          isInSelection;
        const isCollapsed = isRowCollapsed(point.id, hasChildren);
        const areaLabel = areaNames?.[point.areaId];

        return (
          <div
            key={point.id}
            role="treeitem"
            className={cn(
              'outline-row group flex cursor-pointer items-stretch gap-1 pr-2 pl-[8px] text-13',
              multiSelect && isInSelection
                ? multiSelectRadiusRole === 'start'
                  ? 'rounded-t-sm'
                  : multiSelectRadiusRole === 'end'
                    ? 'rounded-b-sm'
                    : multiSelectRadiusRole === 'middle'
                      ? 'rounded-none'
                      : 'rounded-sm'
                : 'rounded-sm',
              isInSelection &&
                multiSelect &&
                'bg-selection text-selection-foreground',
              isInSelection &&
                !multiSelect &&
                'bg-accent text-foreground',
              !isInSelection && 'text-foreground hover:bg-accent/50',
              dragOverId === point.id && 'bg-muted',
              inBranch && selectedId && !multiSelect && 'focused-branch',
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
            onClick={(e) => {
              if (e.shiftKey) {
                extendSelectionTo(index, point.id);
                return;
              }
              selectSingle(index);
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
                'outline-row-content flex min-w-0 flex-1 items-center gap-[2px] py-1.5',
                selectedId && !multiSelect && !inBranch && 'dimmed',
              )}
            >
            <span className="flex size-5 shrink-0 items-center justify-center">
              {hasChildren ? (
                <button
                  type="button"
                  className="flex size-5 cursor-pointer items-center justify-center rounded-full text-foreground/70 hover:text-foreground"
                  aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                  onClick={(e) => toggleCollapse(point.id, hasChildren, e)}
                >
                  {isCollapsed ? (
                    <IconChevronRightSmall size={16} ariaHidden />
                  ) : (
                    <IconChevronDownSmall size={16} ariaHidden />
                  )}
                </button>
              ) : (
                <IconChevronRightSmall
                  size={16}
                  ariaHidden
                  className="shrink-0 text-muted-foreground/40"
                />
              )}
            </span>
            <StateBadge state={point.state} iconOnly />
            <InlineRename
              value={point.task}
              aria-label={`Rename task ${point.task}`}
              className="min-w-0 flex-1"
              startEditing={renamingPointId === point.id}
              onEditingChange={(editing) => {
                if (!editing && renamingPointId === point.id) {
                  setRenamingPointId(null);
                }
              }}
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
                className="max-w-[80px] shrink-0 truncate rounded-full border-[1.5px] border-[rgba(0,0,0,0.08)] bg-[rgba(245,245,245,0)] px-1.5 py-0.5 text-12 text-muted-foreground"
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
                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
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
    </>
  );
}
