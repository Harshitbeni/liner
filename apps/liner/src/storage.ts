const AREA_KEY = 'liner:selectedAreaId';
const pointKey = (areaId: string) => `liner:selectedPointId:${areaId}`;

export function loadSelectedAreaId(): string | null {
  try {
    return localStorage.getItem(AREA_KEY);
  } catch {
    return null;
  }
}

export function saveSelectedAreaId(areaId: string | null): void {
  try {
    if (areaId) localStorage.setItem(AREA_KEY, areaId);
    else localStorage.removeItem(AREA_KEY);
  } catch {
    /* ignore */
  }
}

export function loadSelectedPointId(areaId: string): string | null {
  try {
    return localStorage.getItem(pointKey(areaId));
  } catch {
    return null;
  }
}

export function saveSelectedPointId(
  areaId: string,
  pointId: string | null,
): void {
  try {
    if (pointId) localStorage.setItem(pointKey(areaId), pointId);
    else localStorage.removeItem(pointKey(areaId));
  } catch {
    /* ignore */
  }
}
