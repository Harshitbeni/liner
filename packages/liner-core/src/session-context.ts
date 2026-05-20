import type { OutlineStore } from './store';
import type { Point } from './types';

export function buildSessionContext(
  store: OutlineStore,
  pointId: string,
): string {
  const point = store.getPoint(pointId);
  if (!point) return '';

  const area = store.getArea(point.areaId);
  const lines: string[] = [
    '# Liner point context',
    '',
    `**Task:** ${point.task}`,
    `**State:** ${point.state}`,
  ];

  if (area?.description.trim()) {
    lines.push('', '## Area context', area.description.trim());
  }

  if (point.description.trim()) {
    lines.push('', '## Plan', point.description.trim());
  }

  if (point.parentId) {
    const parent = store.getPoint(point.parentId);
    if (parent) {
      lines.push(
        '',
        '## Parent',
        `- **${parent.task}** (${parent.state})`,
      );
      if (parent.description.trim()) {
        lines.push(parent.description.trim().slice(0, 500));
      }
    }
  }

  const children = store.getChildren(pointId);
  if (children.length > 0) {
    lines.push('', '## Children');
    for (const child of children) {
      lines.push(`- **${child.task}** (${child.state})`);
    }
  }

  lines.push(
    '',
    '_This thread is scoped to this outline point. Prefer updating the plan in responses when asked to plan._',
  );

  return lines.join('\n');
}

export function sessionTitleForPoint(point: Point): string {
  const title = point.task.trim() || 'Liner point';
  return title.length > 80 ? `${title.slice(0, 77)}…` : title;
}
