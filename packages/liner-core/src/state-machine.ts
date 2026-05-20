import type { Point, PointState } from './types';
import { TERMINAL_CHILD_STATES } from './types';

export type TransitionActor = 'human' | 'agent' | 'harness';

export type TransitionResult =
  | { ok: true; state: PointState }
  | { ok: false; error: string };

const HUMAN_TRANSITIONS: Partial<Record<PointState, PointState[]>> = {
  backlog: ['todo', 'cancelled'],
  todo: ['backlog', 'needs-review', 'cancelled'],
  'needs-review': ['todo', 'in-progress', 'cancelled'],
  'in-progress': ['cancelled'],
  done: ['in-progress', 'shipped', 'cancelled'],
  shipped: ['done', 'in-progress'],
  waiting: ['cancelled'],
};

const AGENT_TRANSITIONS: Partial<Record<PointState, PointState[]>> = {
  todo: ['needs-review'],
  'in-progress': ['done'],
};

const HARNESS_TRANSITIONS: Partial<Record<PointState, PointState[]>> = {
  'in-progress': ['waiting', 'todo', 'needs-review'],
  waiting: ['todo', 'needs-review'],
};

export function canTransition(
  from: PointState,
  to: PointState,
  actor: TransitionActor,
): boolean {
  if (from === to) return true;
  const map =
    actor === 'human'
      ? HUMAN_TRANSITIONS
      : actor === 'agent'
        ? AGENT_TRANSITIONS
        : HARNESS_TRANSITIONS;
  return map[from]?.includes(to) ?? false;
}

export function transitionPoint(
  point: Point,
  to: PointState,
  actor: TransitionActor,
): TransitionResult {
  if (!canTransition(point.state, to, actor)) {
    return {
      ok: false,
      error: `Cannot transition ${point.state} → ${to} as ${actor}`,
    };
  }
  return { ok: true, state: to };
}

export function allChildrenTerminal(children: Point[]): boolean {
  if (children.length === 0) return true;
  return children.every((c) => TERMINAL_CHILD_STATES.includes(c.state));
}

export function anyChildNeedsReview(children: Point[]): Point | null {
  return children.find((c) => c.state === 'needs-review') ?? null;
}

export function shouldParentWait(children: Point[]): boolean {
  if (children.length === 0) return false;
  return !allChildrenTerminal(children);
}

export function parentStateAfterChildrenTerminal(
  parent: Point,
): PointState {
  if (parent.description.trim().length > 0) {
    return 'needs-review';
  }
  return 'todo';
}
