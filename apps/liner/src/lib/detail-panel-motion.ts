import { DEFAULT_PANEL_LAYOUT } from '@/storage';

/** System-driven panel open/close (easing, not spring). */
export const DETAIL_PANEL_MOTION_MS = 250;

export function prefersReducedPanelMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Surface/detail split inside the workspace panel (sums to 100). */
export function toInnerLayout(stored: number[]): [number, number] {
  const surface = stored[1] ?? DEFAULT_PANEL_LAYOUT[1];
  const detail = stored[2] ?? DEFAULT_PANEL_LAYOUT[2];
  const sum = surface + detail;
  if (sum < 0.5) return [...DEFAULT_INNER_LAYOUT];
  return [(surface / sum) * 100, (detail / sum) * 100];
}

export const DEFAULT_INNER_LAYOUT: [number, number] = toInnerLayout([
  ...DEFAULT_PANEL_LAYOUT,
]);

/** Persisted 3-tuple: nav % of app + surface/detail % of remaining workspace. */
export function toStoredLayout(nav: number, inner: [number, number]): number[] {
  const workspace = Math.max(100 - nav, 0);
  return [
    nav,
    (inner[0] / 100) * workspace,
    (inner[1] / 100) * workspace,
  ];
}

/** Collapse/expand only within the inner group; nav is never in this array. */
export function layoutWithDetailCollapsed(
  inner: number[],
  collapsed: boolean,
  detailSize: number,
): number[] {
  const surface = inner[0] ?? DEFAULT_INNER_LAYOUT[0];
  const detail = inner[1] ?? 0;

  if (collapsed) {
    return [surface + detail, 0];
  }

  const restored =
    detailSize > 0 ? detailSize : DEFAULT_INNER_LAYOUT[1];
  if (detail < 0.5) {
    return [Math.max(surface - restored, 0), restored];
  }
  return [surface, detail];
}
