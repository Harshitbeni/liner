import type { Point, TaskPhoto } from './types.ts';

export function parseTaskPhotos(value: unknown): TaskPhoto[] {
  if (!Array.isArray(value)) return [];
  const photos: TaskPhoto[] = [];
  for (const item of value) {
    if (
      typeof item === 'object' &&
      item !== null &&
      typeof (item as TaskPhoto).id === 'string' &&
      typeof (item as TaskPhoto).dataUrl === 'string'
    ) {
      photos.push({
        id: (item as TaskPhoto).id,
        dataUrl: (item as TaskPhoto).dataUrl,
      });
    }
  }
  return photos;
}

/** Ensures task description fields exist (API may omit them on older responses). */
export function normalizePoint<T extends Point>(point: T): T {
  const meta = point.meta ?? {};
  const taskDescription =
    typeof point.taskDescription === 'string'
      ? point.taskDescription
      : typeof meta.taskDescription === 'string'
        ? meta.taskDescription
        : '';
  const taskPhotos = parseTaskPhotos(point.taskPhotos ?? meta.taskPhotos);
  if (
    point.taskDescription === taskDescription &&
    point.taskPhotos === taskPhotos
  ) {
    return point;
  }
  return { ...point, taskDescription, taskPhotos };
}
