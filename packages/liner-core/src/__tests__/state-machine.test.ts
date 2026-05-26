import { describe, expect, test } from 'bun:test';
import {
  allChildrenTerminal,
  canTransition,
  shouldParentWait,
} from '../state-machine';
import type { Point } from '../types';

function point(state: Point['state']): Point {
  return {
    id: '1',
    task: 't',
    taskDescription: '',
    taskPhotos: [],
    description: '',
    notes: '',
    state,
    priority: 'none',
    areaId: 'a',
    sessionId: null,
    parentId: null,
    childIds: [],
    meta: {},
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  };
}

describe('state machine', () => {
  test('human backlog to todo', () => {
    expect(canTransition('backlog', 'todo', 'human')).toBe(true);
  });

  test('agent cannot ship', () => {
    expect(canTransition('done', 'shipped', 'agent')).toBe(false);
  });

  test('human can reopen from shipped', () => {
    expect(canTransition('shipped', 'done', 'human')).toBe(true);
    expect(canTransition('shipped', 'in-progress', 'human')).toBe(true);
  });

  test('parent wait when child active', () => {
    expect(
      shouldParentWait([point('in-progress'), point('shipped')]),
    ).toBe(true);
  });

  test('all children terminal', () => {
    expect(
      allChildrenTerminal([point('shipped'), point('cancelled')]),
    ).toBe(true);
  });
});
