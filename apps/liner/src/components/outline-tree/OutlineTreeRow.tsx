import * as React from 'react';
import type { Point } from '@liner/core';
import { isApprovalFlagged } from '../../lib/approval-gate';
import { IconFlag1 } from '@central-icons-react/round-outlined-radius-3-stroke-2/IconFlag1';
import { IconFlag1 as IconFlag1Filled } from '@central-icons-react/round-filled-radius-3-stroke-1.5/IconFlag1';
import { IconArrowRightCircle } from '@central-icons-react/round-filled-radius-3-stroke-1/IconArrowRightCircle';
import { IconChevronDownSmall } from '@central-icons-react/round-filled-radius-3-stroke-1/IconChevronDownSmall';
import { IconChevronRightSmall } from '@central-icons-react/round-filled-radius-3-stroke-1/IconChevronRightSmall';
import { IconLoader } from '@central-icons-react/round-filled-radius-3-stroke-1/IconLoader';
import { api } from '../../api';
import { InlineRename } from '../InlineRename';
import { StateBadge } from '../state-badge';
import { cn } from '@/lib/utils';
import type { MultiSelectRadiusRole, VisibleRow } from './model';

export type OutlineTreeRowProps = {
  row: VisibleRow;
  index: number;
  isToday: boolean;
  selectedId: string | null;
  multiSelect: boolean;
  isInSelection: boolean;
  multiSelectRadiusRole?: MultiSelectRadiusRole;
  inBranch: boolean;
  isCollapsed: boolean;
  areaLabel?: string;
  dragOverId: string | null;
  runningPointIds?: Set<string>;
  renamingPointId: string | null;
  onRenamingChange: (pointId: string | null) => void;
  onReloadRoots: () => void;
  onLoadChildren: (parentId: string) => void;
  onPointsChanged?: () => void;
  onGoToPoint?: (point: Point) => void;
  onSelectRow: (index: number, shiftKey: boolean) => void;
  onToggleCollapse: (
    id: string,
    hasChildren: boolean,
    e: React.MouseEvent,
  ) => void;
  onDragStart: (
    e: React.DragEvent,
    point: Point,
    parentId: string | null,
  ) => void;
  onDragOver: (e: React.DragEvent, pointId: string) => void;
  onDragLeave: () => void;
  onDrop: (
    e: React.DragEvent,
    point: Point,
    siblings: Point[],
    parentId: string | null,
  ) => void;
};

export function OutlineTreeRow({
  row,
  index,
  isToday,
  selectedId,
  multiSelect,
  isInSelection,
  multiSelectRadiusRole,
  inBranch,
  isCollapsed,
  areaLabel,
  dragOverId,
  runningPointIds,
  renamingPointId,
  onRenamingChange,
  onReloadRoots,
  onLoadChildren,
  onPointsChanged,
  onGoToPoint,
  onSelectRow,
  onToggleCollapse,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: OutlineTreeRowProps) {
  const { point, parentId, siblings, hasChildren, touched, guides } = row;
  const branch =
    typeof point.meta?.branch === 'string' ? point.meta.branch.trim() : '';
  const flagged = isApprovalFlagged(point);
  const showProceed = flagged && point.state === 'done';

  const setApprovalFlag = async (requiresApproval: boolean) => {
    await api.updatePoint(point.id, { meta: { requiresApproval } });
    onReloadRoots();
    if (!isToday && point.parentId) {
      await onLoadChildren(point.parentId);
    }
    onPointsChanged?.();
  };

  return (
    <div
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
        isInSelection && !multiSelect && 'bg-accent text-foreground',
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
              onDragOver(e, point.id);
            }
      }
      onDragLeave={isToday ? undefined : onDragLeave}
      onDrop={
        isToday ? undefined : (e) => onDrop(e, point, siblings, parentId)
      }
      onClick={(e) => onSelectRow(index, e.shiftKey)}
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
              onClick={(e) => onToggleCollapse(point.id, hasChildren, e)}
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
              onRenamingChange(null);
            }
          }}
          onSave={async (task) => {
            await api.updatePoint(point.id, { task });
            onReloadRoots();
            if (!isToday && point.parentId) {
              await onLoadChildren(point.parentId);
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
            className="shrink-0 rounded-full border-[1.5px] border-[rgba(0,0,0,0.08)] bg-[rgba(245,245,245,0)] px-1.5 py-0.5 text-12 text-muted-foreground"
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
        {showProceed ? (
          <button
            type="button"
            tabIndex={-1}
            className="shrink-0 cursor-pointer rounded-[32px] bg-foreground pt-[4px] pb-[4px] pl-[10px] pr-[10px] text-12 font-semibold text-background hover:bg-foreground/90"
            aria-label="Proceed — allow parent to continue"
            title="Proceed — allow parent to continue"
            onClick={(e) => {
              e.stopPropagation();
              void setApprovalFlag(false);
            }}
          >
            Proceed
          </button>
        ) : flagged ? (
          <button
            type="button"
            tabIndex={-1}
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-orange-500 hover:bg-accent"
            aria-label="Remove approval requirement"
            title="Remove approval requirement"
            onClick={(e) => {
              e.stopPropagation();
              void setApprovalFlag(false);
            }}
          >
            <IconFlag1Filled size={14} ariaHidden />
          </button>
        ) : (
          <button
            type="button"
            tabIndex={-1}
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground/50 opacity-0 transition-opacity hover:bg-accent hover:text-muted-foreground group-hover:opacity-100"
            aria-label="Require approval before parent runs"
            title="Require approval before parent runs"
            onClick={(e) => {
              e.stopPropagation();
              void setApprovalFlag(true);
            }}
          >
            <IconFlag1 size={14} ariaHidden />
          </button>
        )}
      </div>
    </div>
  );
}
