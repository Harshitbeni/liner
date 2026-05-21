import { IconInboxEmpty } from '@central-icons-react/round-filled-radius-3-stroke-1/IconInboxEmpty';
import type { Area } from '@liner/core';
import type { AreaProgress } from '@/lib/area-progress';
import { cn } from '@/lib/utils';

const SIZE = 14;
const R = 5.25;
const C = 2 * Math.PI * R;

type Props = {
  area: Pick<Area, 'name' | 'icon'>;
  progress: AreaProgress;
  className?: string;
};

function isInboxArea(area: Pick<Area, 'name'>) {
  return area.name.trim().toLowerCase() === 'inbox';
}

function InnerIcon({
  area,
  iconSize = 10,
}: {
  area: Pick<Area, 'name' | 'icon'>;
  iconSize?: number;
}) {
  if (area.icon) {
    return (
      <span className="text-[10px] leading-none" aria-hidden>
        {area.icon}
      </span>
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
    <span className="block size-1 rounded-full bg-current opacity-40" aria-hidden />
  );
}

export function AreaProgressIcon({ area, progress, className }: Props) {
  const label =
    progress.total === 0
      ? 'No tasks'
      : `${progress.completed} of ${progress.total} complete`;

  if (isInboxArea(area)) {
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
          strokeWidth={1.75}
          className="opacity-20"
        />
        {progress.total > 0 && progress.ratio > 0 ? (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            className="opacity-70"
          />
        ) : null}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <InnerIcon area={area} />
      </div>
    </div>
  );
}
