import type { ComponentType } from 'react';
import { IconCalendar1 } from '@central-icons-react/round-filled-radius-3-stroke-1.5/IconCalendar1';
import { IconInboxEmpty } from '@central-icons-react/round-filled-radius-3-stroke-1.5/IconInboxEmpty';
import { IconCircleDashed } from '@central-icons-react/round-outlined-radius-3-stroke-2/IconCircleDashed';
import { IconFormCircle } from '@central-icons-react/round-outlined-radius-3-stroke-2/IconFormCircle';
import { IconProgress25 } from '@central-icons-react/round-outlined-radius-3-stroke-2/IconProgress25';
import { IconProgress50 } from '@central-icons-react/round-outlined-radius-3-stroke-2/IconProgress50';
import { IconProgress100 } from '@central-icons-react/round-outlined-radius-3-stroke-2/IconProgress100';
import type { CentralIconBaseProps } from '@central-icons-react/round-outlined-radius-3-stroke-2/CentralIconBase';
import type { Area } from '@liner/core';
import { isInboxArea, isTodayView } from '@/lib/areas';
import {
  areaProgressTier,
  type AreaProgress,
  type AreaProgressTier,
} from '@/lib/area-progress';
import { cn } from '@/lib/utils';

/** Sidebar nav icon size (Central Icons: round, radius-3). Smart areas use filled glyphs. */
export const SIDEBAR_ICON_SIZE = 16;
const SIZE = SIDEBAR_ICON_SIZE;

const PROGRESS_TIER_ICONS: Record<
  AreaProgressTier,
  ComponentType<CentralIconBaseProps>
> = {
  empty: IconCircleDashed,
  todo: IconFormCircle,
  'partial-25': IconProgress25,
  'partial-50': IconProgress50,
  complete: IconProgress100,
};

const PROGRESS_TIER_COLORS: Record<AreaProgressTier, string> = {
  empty: 'text-neutral-400',
  todo: 'text-muted-foreground',
  'partial-25': 'text-green-600',
  'partial-50': 'text-green-600',
  complete: 'text-green-600',
};

type Props = {
  area: Pick<Area, 'id' | 'name' | 'icon'>;
  progress: AreaProgress;
  className?: string;
};

function SmartAreaIcon({
  area,
  iconSize,
}: {
  area: Pick<Area, 'id' | 'name' | 'icon'>;
  iconSize: number;
}) {
  if (isTodayView(area.id)) {
    return (
      <IconCalendar1
        size={iconSize}
        ariaHidden
        className="text-current opacity-90"
      />
    );
  }
  return (
    <IconInboxEmpty
      size={iconSize}
      ariaHidden
      className="text-current opacity-90"
    />
  );
}

export function AreaProgressIcon({ area, progress, className }: Props) {
  const label =
    progress.total === 0
      ? 'No tasks'
      : `${progress.completed} of ${progress.total} complete`;

  if (isTodayView(area.id) || isInboxArea(area)) {
    return (
      <div
        className={cn('flex shrink-0 items-center justify-center', className)}
        style={{ width: SIZE, height: SIZE }}
        title={label}
        aria-label={label}
      >
        <SmartAreaIcon area={area} iconSize={SIZE} />
      </div>
    );
  }

  const tier = areaProgressTier(progress);
  const Icon = PROGRESS_TIER_ICONS[tier];

  return (
    <div
      className={cn('flex shrink-0 items-center justify-center', className)}
      style={{ width: SIZE, height: SIZE }}
      title={label}
      aria-label={label}
    >
      <Icon
        size={SIZE}
        ariaHidden
        className={cn('shrink-0', PROGRESS_TIER_COLORS[tier])}
      />
    </div>
  );
}
