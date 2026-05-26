import type { Point } from '@liner/core';

export function isApprovalFlagged(point: Point): boolean {
  return point.meta?.requiresApproval === true;
}

export function toggledApprovalFlagMeta(
  point: Point,
): { requiresApproval: boolean } {
  return { requiresApproval: !isApprovalFlagged(point) };
}
