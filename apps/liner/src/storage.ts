const AREA_KEY = 'liner:selectedAreaId';
const LAYOUT_KEY = 'liner:panelLayout';
const pointKey = (areaId: string) => `liner:selectedPointId:${areaId}`;

export const DEFAULT_PANEL_LAYOUT = [18, 54, 28] as const;

export function loadLayoutSizes(): number[] {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return [...DEFAULT_PANEL_LAYOUT];
    const parsed = JSON.parse(raw) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === 3 &&
      parsed.every((n) => typeof n === 'number' && n > 0)
    ) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_PANEL_LAYOUT];
}

export function saveLayoutSizes(sizes: number[]): void {
  try {
    if (sizes.length === 3) {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(sizes));
    }
  } catch {
    /* ignore */
  }
}

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
