import * as React from 'react';
import type { Point, PointState } from '@liner/core';
import { IconFlag1 } from '@central-icons-react/round-outlined-radius-3-stroke-2/IconFlag1';
import { IconFlag1 as IconFlag1Filled } from '@central-icons-react/round-filled-radius-3-stroke-1.5/IconFlag1';
import { IconCircleDashed } from '@central-icons-react/round-outlined-radius-3-stroke-2/IconCircleDashed';
import { IconChevronDownSmall } from '@central-icons-react/round-filled-radius-3-stroke-1/IconChevronDownSmall';
import { api } from '../../api';
import { POINT_STATES } from '../../lib/point-states';
import {
  aggregateAllFlagged,
  aggregateStatus,
  type AggregateStatus,
} from '../../lib/selection-aggregate';
import {
  formatStateLabel,
  STATE_ICON_COLORS,
  StateIcon,
} from '../state-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { prefersReducedPanelMotion } from '@/lib/detail-panel-motion';
import { cn } from '@/lib/utils';

const DARK_MENU =
  'border-neutral-700 bg-neutral-900 text-neutral-50 shadow-lg';
const DARK_MENU_ITEM = 'focus:bg-neutral-800';

type Props = {
  points: Point[];
  isToday: boolean;
  onReloadRoots: () => void;
  onReloadParent: (parentId: string) => Promise<void>;
  onPointsChanged?: () => void;
  className?: string;
};

function StatusTriggerContent({ status }: { status: AggregateStatus }) {
  if (status === 'mixed') {
    return (
      <>
        <span className="inline-flex size-5 shrink-0 items-center justify-center text-neutral-400">
          <IconCircleDashed size={14} ariaHidden />
        </span>
        <span className="capitalize">Mixed</span>
      </>
    );
  }
  return (
    <>
      <span
        className={cn(
          'inline-flex size-5 shrink-0 items-center justify-center',
          STATE_ICON_COLORS[status],
        )}
      >
        <StateIcon state={status} size={14} />
      </span>
      <span className="capitalize">{formatStateLabel(status)}</span>
    </>
  );
}

export function BulkActionBar({
  points,
  isToday,
  onReloadRoots,
  onReloadParent,
  onPointsChanged,
  className,
}: Props) {
  const [busy, setBusy] = React.useState(false);
  const reducedMotion = React.useMemo(() => prefersReducedPanelMotion(), []);
  const status = aggregateStatus(points);
  const allFlagged = aggregateAllFlagged(points);

  const afterBulkUpdate = React.useCallback(async () => {
    onReloadRoots();
    onPointsChanged?.();
  }, [onReloadRoots, onPointsChanged]);

  const reloadParentsForFlags = React.useCallback(async () => {
    if (isToday) return;
    const parentIds = new Set(
      points.map((p) => p.parentId).filter((id): id is string => id != null),
    );
    await Promise.all([...parentIds].map((id) => onReloadParent(id)));
  }, [isToday, points, onReloadParent]);

  const applyStatus = async (state: PointState) => {
    if (busy) return;
    setBusy(true);
    try {
      await Promise.all(
        points.map((p) => api.updatePoint(p.id, { state })),
      );
      await afterBulkUpdate();
    } finally {
      setBusy(false);
    }
  };

  const toggleFlags = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const requiresApproval = !allFlagged;
      await Promise.all(
        points.map((p) => api.updatePoint(p.id, { meta: { requiresApproval } })),
      );
      await afterBulkUpdate();
      await reloadParentsForFlags();
    } finally {
      setBusy(false);
    }
  };

  const count = points.length;

  return (
    <div
      role="toolbar"
      aria-label={`Bulk actions, ${count} tasks selected`}
      className={cn(
        'flex items-center gap-0.5 rounded-full border border-neutral-800 bg-neutral-950 px-1 py-1 text-neutral-50 shadow-lg',
        !reducedMotion &&
          'animate-in fade-in slide-in-from-bottom-4 duration-200',
        busy && 'opacity-80',
        className,
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          type="button"
          disabled={busy}
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-13 text-neutral-50 outline-none hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Change status for selected tasks"
        >
          <StatusTriggerContent status={status} />
          <IconChevronDownSmall
            size={14}
            ariaHidden
            className="shrink-0 text-neutral-400"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          side="top"
          sideOffset={8}
          className={DARK_MENU}
        >
          {POINT_STATES.map((s) => (
            <DropdownMenuItem
              key={s}
              className={cn('text-13 capitalize', DARK_MENU_ITEM)}
              onSelect={() => void applyStatus(s)}
            >
              <span
                className={cn(
                  'inline-flex size-5 shrink-0 items-center justify-center',
                  STATE_ICON_COLORS[s],
                )}
              >
                <StateIcon state={s} size={14} />
              </span>
              <span className="text-neutral-50">{formatStateLabel(s)}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="mx-0.5 h-5 w-px bg-neutral-700" aria-hidden />

      {/* Future: move-to-area action */}
      <button
        type="button"
        disabled={busy}
        className={cn(
          'flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60',
          allFlagged ? 'text-orange-500' : 'text-neutral-400',
        )}
        aria-label={
          allFlagged
            ? 'Clear approval flag on selected tasks'
            : 'Require approval on selected tasks'
        }
        title={
          allFlagged
            ? 'Clear approval flag'
            : 'Require approval before parent runs'
        }
        onClick={() => void toggleFlags()}
      >
        {allFlagged ? (
          <IconFlag1Filled size={14} ariaHidden />
        ) : (
          <IconFlag1 size={14} ariaHidden />
        )}
      </button>
    </div>
  );
}
