import { describe, expect, test } from 'bun:test';
import type { Point } from '@liner/core';
import {
  computeSiblingReorder,
  type VisibleRow,
} from './model';

function makePoint(id: string, parentId: string | null = null): Point {
  return {
    id,
    task: id,
    areaId: 'a',
    parentId,
    childIds: [],
    sortOrder: 0,
    state: 'idle',
    meta: {},
    createdAt: '',
    updatedAt: '',
  };
}

function row(
  point: Point,
  siblings: Point[],
  parentId: string | null,
  focusIndex: number,
): { row: VisibleRow; visibleRows: VisibleRow[]; focusIndex: number } {
  const visibleRow: VisibleRow = {
    point,
    depth: parentId ? 1 : 0,
    parentId,
    siblings,
    hasChildren: false,
    touched: true,
    guides: [],
  };
  const parentRow: VisibleRow | null = parentId
    ? {
        point: makePoint(parentId),
        depth: 0,
        parentId: null,
        siblings: [makePoint(parentId)],
        hasChildren: true,
        touched: true,
        guides: [],
      }
    : null;
  const visibleRows = parentRow
    ? [parentRow, visibleRow]
    : [visibleRow];
  return {
    row: visibleRow,
    visibleRows,
    focusIndex: parentRow ? 1 : 0,
  };
}

describe('computeSiblingReorder', () => {
  test('swaps with previous sibling', () => {
    const a = makePoint('a');
    const b = makePoint('b');
    const siblings = [a, b];
    const { row: r, visibleRows, focusIndex } = row(b, siblings, null);
    const plan = computeSiblingReorder(r, 'up', visibleRows, focusIndex);
    expect(plan?.orderedIds).toEqual(['b', 'a']);
  });

  test('no-op when row above is parent', () => {
    const parent = makePoint('p');
    const child = makePoint('c', 'p');
    const siblings = [child];
    const { row: r, visibleRows, focusIndex } = row(child, siblings, 'p');
    expect(computeSiblingReorder(r, 'up', visibleRows, focusIndex)).toBeNull();
  });

  test('no-op at first sibling among peers', () => {
    const a = makePoint('a');
    const b = makePoint('b');
    const siblings = [a, b];
    const { row: r, visibleRows, focusIndex } = row(a, siblings, null);
    expect(computeSiblingReorder(r, 'up', visibleRows, focusIndex)).toBeNull();
  });

  test('swaps with next sibling', () => {
    const a = makePoint('a');
    const b = makePoint('b');
    const siblings = [a, b];
    const { row: r, visibleRows, focusIndex } = row(a, siblings, null);
    const plan = computeSiblingReorder(r, 'down', visibleRows, focusIndex);
    expect(plan?.orderedIds).toEqual(['b', 'a']);
  });

  test('no-op at last sibling', () => {
    const a = makePoint('a');
    const b = makePoint('b');
    const siblings = [a, b];
    const { row: r, visibleRows, focusIndex } = row(b, siblings, null);
    expect(computeSiblingReorder(r, 'down', visibleRows, focusIndex)).toBeNull();
  });
});
