type TaskPhoto = {
  id: string;
  dataUrl: string;
};

type PointLike = {
  taskDescription?: string;
  taskPhotos?: TaskPhoto[];
  meta?: Record<string, unknown>;
};

function parseTaskPhotos(value: unknown): TaskPhoto[] {
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

export function normalizePoint<T extends PointLike>(point: T): T & {
  taskDescription: string;
  taskPhotos: TaskPhoto[];
} {
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

export function normalizePoints<T extends PointLike>(points: T[]) {
  return points.map((p) => normalizePoint(p));
}
