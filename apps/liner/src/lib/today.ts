/** Virtual nav id for the Today smart view (not stored in the DB). */
export const TODAY_VIEW_ID = '__liner_today__';

/** ISO timestamp for local midnight today. */
export function startOfLocalDayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
