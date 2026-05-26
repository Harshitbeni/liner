import * as React from 'react';
import { cn } from '@/lib/utils';
import { prefersReducedPanelMotion } from '@/lib/detail-panel-motion';

/** Keyboard hints shown in the OutlineTree empty state (fade-through cycle). */
export const OUTLINE_SHORTCUT_HINTS = [
  '⌥ + N - New Task',
  'F - Flag Task',
  '⌘ + Del - Remove Task',
  '⌘ + ↑ / ↓ - Reorder Task',
] as const;

/** fade-through effect (animate-text) — scaled website-default runtime */
const FADE_THROUGH = {
  enterDurationMs: 302,
  exitDurationMs: 187,
  enterEasing: 'cubic-bezier(0.2, 0, 0, 1)',
  exitEasing: 'cubic-bezier(0.4, 0, 1, 1)',
  yTravelMultiplier: 0.58,
  holdMs: 3000,
  gapMs: 320,
  microDelayMs: 60,
  reducedCycleMs: 3000,
} as const;

type MotionFrame = {
  opacity: number;
  y_px: number;
  scale: number;
  blur_px: number;
};

const ENTER_FROM: MotionFrame = {
  opacity: 0,
  y_px: 6,
  scale: 0.99,
  blur_px: 2,
};
const ENTER_TO: MotionFrame = {
  opacity: 1,
  y_px: 0,
  scale: 1,
  blur_px: 0,
};
const EXIT_FROM: MotionFrame = ENTER_TO;
const EXIT_TO: MotionFrame = {
  opacity: 0,
  y_px: -4,
  scale: 1,
  blur_px: 0,
};

function toKeyframe(frame: MotionFrame): Keyframe {
  const y = frame.y_px * FADE_THROUGH.yTravelMultiplier;
  return {
    opacity: frame.opacity,
    transform: `translate3d(0, ${y}px, 0) scale(${frame.scale})`,
    filter: frame.blur_px > 0 ? `blur(${frame.blur_px}px)` : 'none',
  };
}

function applyFrame(element: HTMLElement, frame: MotionFrame): void {
  const keyframe = toKeyframe(frame);
  element.style.opacity = String(keyframe.opacity);
  element.style.transform = keyframe.transform as string;
  element.style.filter = keyframe.filter as string;
}

async function animateFrame(
  element: HTMLElement,
  from: MotionFrame,
  to: MotionFrame,
  durationMs: number,
  easing: string,
): Promise<void> {
  applyFrame(element, from);
  const animation = element.animate([toKeyframe(from), toKeyframe(to)], {
    duration: durationMs,
    easing,
    fill: 'forwards',
  });
  try {
    await animation.finished;
  } catch {
    animation.cancel();
    throw new DOMException('Aborted', 'AbortError');
  }
  applyFrame(element, to);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const id = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(id);
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort);
  });
}

type CyclingShortcutHintsProps = {
  hints?: readonly string[];
  className?: string;
};

export function CyclingShortcutHints({
  hints = OUTLINE_SHORTCUT_HINTS,
  className,
}: CyclingShortcutHintsProps) {
  const unitRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const unit = unitRef.current;
    if (!unit || hints.length === 0) return;

    const abort = new AbortController();
    const { signal } = abort;

    const run = async () => {
      let index = 0;
      unit.textContent = hints[0]!;

      if (prefersReducedPanelMotion()) {
        while (!signal.aborted) {
          await sleep(FADE_THROUGH.reducedCycleMs, signal);
          index = (index + 1) % hints.length;
          unit.textContent = hints[index]!;
        }
        return;
      }

      applyFrame(unit, ENTER_FROM);
      await animateFrame(
        unit,
        ENTER_FROM,
        ENTER_TO,
        FADE_THROUGH.enterDurationMs,
        FADE_THROUGH.enterEasing,
      );

      while (!signal.aborted) {
        await sleep(FADE_THROUGH.holdMs, signal);
        await animateFrame(
          unit,
          EXIT_FROM,
          EXIT_TO,
          FADE_THROUGH.exitDurationMs,
          FADE_THROUGH.exitEasing,
        );
        index = (index + 1) % hints.length;
        await sleep(FADE_THROUGH.microDelayMs, signal);
        unit.textContent = hints[index]!;
        applyFrame(unit, ENTER_FROM);
        await animateFrame(
          unit,
          ENTER_FROM,
          ENTER_TO,
          FADE_THROUGH.enterDurationMs,
          FADE_THROUGH.enterEasing,
        );
        await sleep(FADE_THROUGH.gapMs, signal);
      }
    };

    void run().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      throw error;
    });

    return () => {
      abort.abort();
      unit.getAnimations().forEach((animation) => animation.cancel());
    };
  }, [hints]);

  return (
    <p
      className={cn('text-12 text-muted-foreground text-center', className)}
      aria-live="polite"
    >
      <span
        ref={unitRef}
        className="inline-block [transform-origin:50%_55%] will-change-[transform,opacity,filter]"
      />
    </p>
  );
}
