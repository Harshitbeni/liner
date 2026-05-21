import { IconCalendar1 } from '@central-icons-react/round-filled-radius-3-stroke-1.5/IconCalendar1';
import { IconInboxEmpty } from '@central-icons-react/round-filled-radius-3-stroke-1.5/IconInboxEmpty';
import { IconCircle } from '@central-icons-react/round-outlined-radius-3-stroke-1.5/IconCircle';
import type { Area } from '@liner/core';
import { isInboxArea, isTodayView } from '@/lib/areas';
import type { AreaProgress } from '@/lib/area-progress';
import { cn } from '@/lib/utils';

/** Sidebar nav icon size (Central Icons: round, radius-3, stroke 1.5). Smart areas use filled glyphs. */
export const SIDEBAR_ICON_SIZE = 16;
const SIZE = SIDEBAR_ICON_SIZE;
const R = 6;
const C = 2 * Math.PI * R;
const RING_STROKE = 1.5;

type Props = {
  area: Pick<Area, 'id' | 'name' | 'icon'>;
  progress: AreaProgress;
  className?: string;
};

function InnerIcon({
  area,
  iconSize = 8,
}: {
  area: Pick<Area, 'id' | 'name' | 'icon'>;
  iconSize?: number;
}) {
  if (area.icon) {
    return (
      <span
        className="leading-none"
        style={{ fontSize: iconSize }}
        aria-hidden
      >
        {area.icon}
      </span>
    );
  }
  if (isTodayView(area.id)) {
    return (
      <IconCalendar1
        size={iconSize}
        ariaHidden
        className="text-current opacity-90"
      />
    );
  }
  if (isInboxArea(area)) {
    return (
      <IconInboxEmpty
        size={iconSize}
        ariaHidden
        className="text-current opacity-90"
      />
    );
  }
  return (
    <IconCircle
      size={8}
      ariaHidden
      className="text-current opacity-40"
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
        <InnerIcon area={area} iconSize={SIZE} />
      </div>
    );
  }

  const offset = C * (1 - progress.ratio);

  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: SIZE, height: SIZE }}
      title={label}
      aria-label={label}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="block"
        aria-hidden
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth={RING_STROKE}
          className="opacity-20"
        />
        {progress.total > 0 && progress.ratio > 0 ? (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            className="opacity-70"
          />
        ) : null}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <InnerIcon area={area} iconSize={8} />
      </div>
    </div>
  );
}
