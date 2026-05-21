import type { Area } from '@liner/core';
import { TODAY_VIEW_ID } from '@/lib/today';

/** Smart area: seeded Inbox for captured tasks (name match, case-insensitive). */
export function isInboxArea(area: Pick<Area, 'name'>): boolean {
  return area.name.trim().toLowerCase() === 'inbox';
}

export function isTodayView(areaId: string | null | undefined): boolean {
  return areaId === TODAY_VIEW_ID;
}

export function isSmartView(areaId: string | null | undefined): boolean {
  return isTodayView(areaId);
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
