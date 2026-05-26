import * as React from 'react';
import type { Point } from '@liner/core';
import { api } from '../api';
import { OutlineTreeRow } from './outline-tree/OutlineTreeRow';
import {
  applyRemovedPointsToTree,
  buildAncestorSet,
  buildMultiSelectRadiusRoles,
  buildRowGuides,
  collectAllRemovedIds,
  collectDescendantIds,
  collectVisibleSubtreeIds,
  ensureSubtreeLoaded,
  findPoint,
  idsInVisibleRange,
  loadTodayTree,
  patchChildrenMapAfterMove,
  pickNeighborAfterDelete,
  topLevelDeleteIds,
  type VisibleRow,
} from './outline-tree/model';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
        const { point, hasChildren } = row;
        const isInSelection = selectedIds.has(point.id);
        const multiSelectRadiusRole = multiSelectRadiusRoles.get(point.id);
        const inBranch =
          !selectedId ||
          multiSelect ||
          branchAncestors.has(point.id) ||
          isInSelection;
        const isCollapsed = isRowCollapsed(point.id, hasChildren);

        return (
          <OutlineTreeRow
            key={point.id}
            row={row}
            index={index}
            isToday={isToday}
            selectedId={selectedId}
            multiSelect={multiSelect}
            isInSelection={isInSelection}
            multiSelectRadiusRole={multiSelectRadiusRole}
            inBranch={inBranch}
            isCollapsed={isCollapsed}
            areaLabel={areaNames?.[point.areaId]}
            dragOverId={dragOverId}
            runningPointIds={runningPointIds}
            renamingPointId={renamingPointId}
            onRenamingChange={setRenamingPointId}
            onReloadRoots={reloadRoots}
            onLoadChildren={loadChildren}
            onPointsChanged={onPointsChanged}
            onGoToPoint={onGoToPoint}
            onSelectRow={(idx, shiftKey) => {
              if (shiftKey) {
                extendSelectionTo(idx, point.id);
                return;
              }
              selectSingle(idx);
            }}
            onToggleCollapse={toggleCollapse}
            onDragStart={onDragStart}
            onDragOver={(_e, pointId) => setDragOverId(pointId)}
            onDragLeave={() => setDragOverId(null)}
            onDrop={onDropOn}
          />
        );
      })}
    </div>
    </>
  );
}
