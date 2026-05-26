import type { Dispatch, SetStateAction } from 'react';
import type { Point } from '@liner/core';
import { api } from '../../api';

export type VisibleRow = {
  point: Point;
  depth: number;
  parentId: string | null;
  siblings: Point[];
  hasChildren: boolean;
  touched: boolean;
  guides: boolean[];
};

export type MultiSelectRadiusRole = 'single' | 'start' | 'end' | 'middle';

export function buildRowGuides(rows: VisibleRow[], index: number): boolean[] {
  const { depth } = rows[index];
  const next = rows[index + 1];
  const guides: boolean[] = [];
  for (let level = 0; level < depth; level++) {
    guides.push(
      next == null || next.depth > level || next.depth < depth,
    );
  }
  return guides;
}

export function sortByRecent(points: Point[]): Point[] {
  return [...points].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function findPoint(
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

export function collectVisibleSubtreeIds(
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

export function patchChildrenMapAfterMove(
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

export function isDescendantOf(
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

export function topLevelDeleteIds(
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

export function collectDescendantIds(
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

export function collectAllRemovedIds(
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

export function applyRemovedPointsToTree(
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

export function pickNeighborAfterDelete(
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

export async function ensureSubtreeLoaded(
  areaId: string,
  rootId: string,
  roots: Point[],
  childrenMap: Record<string, Point[]>,
  setChildrenMap: Dispatch<SetStateAction<Record<string, Point[]>>>,
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

export function buildMultiSelectRadiusRoles(
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

export function idsInVisibleRange(
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

export function buildAncestorSet(
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

export async function loadTodayTree(since: string): Promise<{
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
