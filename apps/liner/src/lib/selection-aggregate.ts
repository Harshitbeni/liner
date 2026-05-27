import type { Point, PointState } from '@liner/core';
import { isApprovalFlagged } from './approval-gate';

export type AggregateStatus = PointState | 'mixed';

export function aggregateStatus(points: Point[]): AggregateStatus {
  if (points.length === 0) return 'mixed';
  const states = new Set(points.map((p) => p.state));
  return states.size === 1 ? [...states][0]! : 'mixed';
}

export function aggregateAllFlagged(points: Point[]): boolean {
  return points.length > 0 && points.every(isApprovalFlagged);
}
