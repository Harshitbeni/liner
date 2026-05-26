import type { Point } from './types';

export const APPROVAL_FLAG_META_KEY = 'requiresApproval';

export function isApprovalFlagged(point: Point): boolean {
  return point.meta?.[APPROVAL_FLAG_META_KEY] === true;
}

export function childBlocksParentAutomation(children: Point[]): boolean {
  return children.some(isApprovalFlagged);
}
