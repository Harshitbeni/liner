import * as React from 'react';
import type { Point } from '@liner/core';
import { api } from '../api';

type Props = {
  areaId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  refreshKey: number;
  runningPointIds?: Set<string>;
};

export function OutlineTree({
  areaId,
  selectedId,
  onSelect,
  refreshKey,
  runningPointIds,
}: Props) {
  const [roots, setRoots] = React.useState<Point[]>([]);
  const [childrenMap, setChildrenMap] = React.useState<Record<string, Point[]>>(
    {},
  );
  const [dragOverId, setDragOverId] = React.useState<string | null>(null);
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

  const renderPoint = (
    point: Point,
    depth: number,
    parentId: string | null,
    siblings: Point[],
  ) => {
    const indent = `indent-${Math.min(depth, 3)}`;
    const branch =
      typeof point.meta?.branch === 'string' ? point.meta.branch.trim() : '';
    return (
      <div key={point.id}>
        <div
          className={`outline-row ${indent} ${selectedId === point.id ? 'selected' : ''} ${dragOverId === point.id ? 'drag-over' : ''}`}
          draggable
          onDragStart={(e) => onDragStart(e, point, parentId)}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverId(point.id);
          }}
          onDragLeave={() => setDragOverId(null)}
          onDrop={(e) => onDropOn(e, point, siblings, parentId)}
          onClick={() => onSelect(point.id)}
          onMouseEnter={() => {
            if (point.childIds.length && !childrenMap[point.id]) {
              loadChildren(point.id);
            }
          }}
        >
          <span className="drag-handle" title="Drag to reorder">
            ⋮⋮
          </span>
          <span className={`state-pill ${point.state}`}>{point.state}</span>
          {runningPointIds?.has(point.id) ? (
            <span className="agent-running-dot" title="Agent running">
              ◉
            </span>
          ) : null}
          <span style={{ flex: 1 }}>{point.task}</span>
          {branch ? (
            <span className="branch-chip" title={branch}>
              {branch}
            </span>
          ) : null}
          {branch ? (
            <button
              type="button"
              className="branch-copy-btn"
              title="Copy branch name"
              onClick={(e) => {
                e.stopPropagation();
                void navigator.clipboard.writeText(branch);
              }}
            >
              ⧉
            </button>
          ) : null}
          {point.priority !== 'none' ? (
            <span className="priority-badge">{point.priority}</span>
          ) : null}
        </div>
        {(childrenMap[point.id] ?? []).map((child) =>
          renderPoint(
            child,
            depth + 1,
            point.id,
            childrenMap[point.id] ?? [],
          ),
        )}
      </div>
    );
  };

  return (
    <div>
      {roots.length === 0 ? (
        <div className="empty-state">
          <p>No tasks in this area</p>
          <p className="empty-state-hint">Press New or ⌘N to add your first task</p>
        </div>
      ) : (
        roots.map((p) => renderPoint(p, 0, null, roots))
      )}
    </div>
  );
}
