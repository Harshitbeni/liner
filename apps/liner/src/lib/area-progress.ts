import type { Point, PointState } from '@liner/core';

/** States counted as complete for area progress. */
const COMPLETE_STATES: PointState[] = ['done', 'shipped', 'cancelled'];

export type AreaProgress = {
  total: number;
  completed: number;
  ratio: number;
};

export function computeAreaProgress(points: Point[]): AreaProgress {
  const total = points.length;
  if (total === 0) {
    return { total: 0, completed: 0, ratio: 0 };
  }
  const completed = points.filter((p) =>
    COMPLETE_STATES.includes(p.state),
  ).length;
  return { total, completed, ratio: completed / total };
}

/** Discrete progress tier for sidebar icons (matches task state icon language). */
export type AreaProgressTier = 'empty' | 'todo' | 'partial-25' | 'partial-50' | 'complete';

export function areaProgressTier(progress: AreaProgress): AreaProgressTier {
  if (progress.total === 0) return 'empty';
  if (progress.completed >= progress.total) return 'complete';
  if (progress.completed === 0) return 'todo';
  if (progress.ratio < 0.5) return 'partial-25';
  return 'partial-50';
}
