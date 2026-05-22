import type { Area } from '@liner/core';
import { TODAY_VIEW_ID } from '@/lib/today';

/** Virtual nav id for Inbox before the workspace has a persisted Inbox area. */
export const INBOX_PLACEHOLDER_ID = '__liner_inbox__';

/** Smart area: seeded Inbox for captured tasks (name match, case-insensitive). */
export function isInboxArea(area: Pick<Area, 'name'>): boolean {
  return area.name.trim().toLowerCase() === 'inbox';
}

export function isInboxPlaceholder(areaId: string | null | undefined): boolean {
  return areaId === INBOX_PLACEHOLDER_ID;
}

export function isTodayView(areaId: string | null | undefined): boolean {
  return areaId === TODAY_VIEW_ID;
}

export function isSmartView(areaId: string | null | undefined): boolean {
  return isTodayView(areaId) || isInboxPlaceholder(areaId);
}

export function syntheticTodayArea(): Area {
  const ts = new Date(0).toISOString();
  return {
    id: TODAY_VIEW_ID,
    name: 'Today',
    description: 'Tasks you worked on today',
    sortOrder: -1,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function syntheticInboxArea(): Area {
  const ts = new Date(0).toISOString();
  return {
    id: INBOX_PLACEHOLDER_ID,
    name: 'Inbox',
    description: 'Default workspace area for captured tasks.',
    sortOrder: 0,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function partitionAreas(areas: Area[]): {
  inbox: Area | null;
  userAreas: Area[];
} {
  let inbox: Area | null = null;
  const userAreas: Area[] = [];
  for (const area of areas) {
    if (isInboxArea(area)) inbox = area;
    else userAreas.push(area);
  }
  return { inbox, userAreas };
}
