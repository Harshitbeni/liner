import type { ComponentType } from 'react';
import type { PointState } from '@liner/core';
import { IconCircleDashed } from '@central-icons-react/round-outlined-radius-3-stroke-2/IconCircleDashed';
import { IconCircleX } from '@central-icons-react/round-outlined-radius-3-stroke-2/IconCircleX';
import { IconFormCircle } from '@central-icons-react/round-outlined-radius-3-stroke-2/IconFormCircle';
import { IconProgress25 } from '@central-icons-react/round-outlined-radius-3-stroke-2/IconProgress25';
import { IconProgress50 } from '@central-icons-react/round-outlined-radius-3-stroke-2/IconProgress50';
import { IconProgress100 } from '@central-icons-react/round-outlined-radius-3-stroke-2/IconProgress100';
import { IconExclamationCircle } from '@central-icons-react/round-outlined-radius-3-stroke-2/IconExclamationCircle';
import type { CentralIconBaseProps } from '@central-icons-react/round-outlined-radius-3-stroke-2/CentralIconBase';
import { cn } from '@/lib/utils';

const STATE_ICONS: Record<PointState, ComponentType<CentralIconBaseProps>> = {
  backlog: IconCircleDashed,
  todo: IconFormCircle,
  'needs-review': IconExclamationCircle,
  'in-progress': IconProgress25,
  waiting: IconProgress50,
  done: IconProgress100,
  shipped: IconProgress100,
  cancelled: IconCircleX,
};

const STATE_ICON_COLORS: Record<PointState, string> = {
  backlog: 'text-neutral-400',
  todo: 'text-muted-foreground',
  'needs-review': 'text-yellow-600',
  'in-progress': 'text-green-600',
  waiting: 'text-yellow-600',
  done: 'text-green-600',
  shipped: 'text-blue-600',
  cancelled: 'text-neutral-400',
};

export function formatStateLabel(state: PointState) {
  return state.replace(/-/g, ' ');
}

export function StateIcon({
  state,
  size = 12,
  className,
}: {
  state: PointState;
  size?: number;
  className?: string;
}) {
  const Icon = STATE_ICONS[state];
  return (
    <Icon
      size={size}
      ariaHidden
      className={cn('shrink-0', STATE_ICON_COLORS[state], className)}
    />
  );
}

export function StateBadge({
  state,
  iconOnly = false,
  className,
}: {
  state: PointState;
  iconOnly?: boolean;
  className?: string;
}) {
  const label = formatStateLabel(state);

  if (iconOnly) {
    return (
      <span
        className={cn('inline-flex size-5 shrink-0 items-center justify-center', className)}
        title={label}
        aria-label={label}
      >
        <StateIcon state={state} size={14} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'text-12 inline-flex shrink-0 items-center gap-1 capitalize text-muted-foreground',
        className,
      )}
    >
      <StateIcon state={state} />
      {label}
    </span>
  );
}
