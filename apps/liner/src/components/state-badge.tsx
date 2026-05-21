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
      className={cn('shrink-0 text-muted-foreground', className)}
    />
  );
}

export function StateBadge({
  state,
  className,
}: {
  state: PointState;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'text-12 inline-flex shrink-0 items-center gap-1 capitalize text-muted-foreground',
        className,
      )}
    >
      <StateIcon state={state} />
      {formatStateLabel(state)}
    </span>
  );
}
