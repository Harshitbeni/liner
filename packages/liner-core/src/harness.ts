import {
  childBlocksParentAutomation,
  isApprovalFlagged,
} from './approval-gate';
import {
  extractPlanFromContent,
  parseCompletionFromAgent,
  parsePlanReviewJson,
  planLooksReady,
  promptForIntent,
  type AgentIntent,
} from './agent-prompts';
import {
  buildSessionContext,
  sessionTitleForPoint,
} from './session-context';
import type { OutlineStore } from './store';
import {
  allChildrenTerminal,
  canTransition,
  parentStateAfterChildrenTerminal,
  shouldParentWait,
  transitionPoint,
} from './state-machine';
import type {
  CompletionVerificationResult,
  PlanReviewResult,
  Point,
  PointState,
  ThreadMessage,
} from './types';
import type { SessionRpcAdapter } from './rpc/types';

export type HarnessOptions = {
  strictPlanGate?: boolean;
  onPlanReview?: (input: {
    parent: Point;
    child: Point;
  }) => Promise<PlanReviewResult>;
  onCompletionVerification?: (input: {
    parent: Point;
    children: Point[];
  }) => Promise<CompletionVerificationResult>;
};

export type AgentRunListener = (pointId: string, running: boolean) => void;

export type StateChangeListener = (
  pointId: string,
  from: PointState,
  to: PointState,
  actor: 'human' | 'agent' | 'harness',
) => void;

export class HarnessOrchestrator {
  private readonly runningAgents = new Set<string>();
  private readonly agentRunListeners = new Set<AgentRunListener>();
  private readonly stateChangeListeners = new Set<StateChangeListener>();
  /** Debounce duplicate auto-agent triggers on the same transition. */
  private readonly recentAutoRuns = new Map<string, number>();
  private static readonly AUTO_RUN_DEBOUNCE_MS = 2_500;

  constructor(
    private store: OutlineStore,
    private rpc: SessionRpcAdapter,
    private options: HarnessOptions = {},
  ) {}

  isAgentRunning(pointId: string): boolean {
    return this.runningAgents.has(pointId);
  }

  onAgentRun(listener: AgentRunListener): () => void {
    this.agentRunListeners.add(listener);
    return () => this.agentRunListeners.delete(listener);
  }

  onStateChange(listener: StateChangeListener): () => void {
    this.stateChangeListeners.add(listener);
    return () => this.stateChangeListeners.delete(listener);
  }

  private emitStateChange(
    pointId: string,
    from: PointState,
    to: PointState,
    actor: 'human' | 'agent' | 'harness',
  ): void {
    for (const fn of this.stateChangeListeners) {
      fn(pointId, from, to, actor);
    }
  }

  private setPointState(
    pointId: string,
    to: PointState,
    actor: 'human' | 'agent' | 'harness',
  ): Point | null {
    const point = this.store.getPoint(pointId);
    if (!point || point.state === to) return point;
    const updated = this.store.updatePoint(pointId, { state: to });
    if (updated) this.emitStateChange(pointId, point.state, to, actor);
    return updated;
  }

  private setAgentRunning(pointId: string, running: boolean): void {
    if (running) this.runningAgents.add(pointId);
    else this.runningAgents.delete(pointId);
    for (const fn of this.agentRunListeners) {
      fn(pointId, running);
    }
  }

  async maybeAutoRunAgent(
    pointId: string,
    newState: PointState,
    previousState: PointState,
  ): Promise<{ message: ThreadMessage | null; stateChanged?: PointState } | null> {
    if (!this.store.getSettings().autoAgents) return null;
    if (this.runningAgents.has(pointId)) return null;

    const point = this.store.getPoint(pointId);
    if (!point) return null;

    const children = this.store.getChildren(pointId);
    if (childBlocksParentAutomation(children)) return null;

    const guardKey = `${pointId}:${previousState}->${newState}`;
    const last = this.recentAutoRuns.get(guardKey);
    const now = Date.now();
    if (last && now - last < HarnessOrchestrator.AUTO_RUN_DEBOUNCE_MS) {
      return null;
    }

    let intent: AgentIntent | null = null;
    if (
      newState === 'todo' &&
      !point.description.trim() &&
      (previousState === 'backlog' || previousState === 'todo')
    ) {
      intent = 'plan';
    } else if (
      newState === 'in-progress' &&
      previousState !== 'in-progress' &&
      (previousState === 'needs-review' || previousState === 'todo')
    ) {
      intent = 'execute';
    }

    if (!intent) return null;

    this.recentAutoRuns.set(guardKey, now);
    try {
      return await this.runAgent(pointId, intent);
    } finally {
      setTimeout(() => {
        if (this.recentAutoRuns.get(guardKey) === now) {
          this.recentAutoRuns.delete(guardKey);
        }
      }, HarnessOrchestrator.AUTO_RUN_DEBOUNCE_MS);
    }
  }

  async onPointStateChange(
    pointId: string,
    newState: PointState,
    previousState: PointState,
  ): Promise<void> {
    const point = this.store.getPoint(pointId);
    if (!point) return;

    if (point.parentId) {
      await this.syncParentFromChildren(point.parentId);
    }

    if (newState === 'needs-review' && previousState !== 'needs-review') {
      await this.maybeTriggerPlanReview(point);
    }

    if (newState === 'shipped' || newState === 'cancelled') {
      if (point.parentId) {
        await this.checkParentCompletion(point.parentId);
      }
    }
  }

  async syncParentFromChildren(parentId: string): Promise<Point | null> {
    const parent = this.store.getPoint(parentId);
    if (!parent) return null;
    const children = this.store.getChildren(parentId);
    if (children.length === 0) return parent;

    const allCancelled =
      children.length > 0 &&
      children.every((c) => c.state === 'cancelled');

    if (shouldParentWait(children)) {
      if (parent.state !== 'waiting' && parent.state !== 'cancelled') {
        this.store.logHarnessEvent(parentId, 'parent-waiting', {
          childStates: children.map((c) => ({ id: c.id, state: c.state })),
        });
        return this.setPointState(parentId, 'waiting', 'harness');
      }
      return parent;
    }

    if (
      parent.state === 'waiting' &&
      (allChildrenTerminal(children) || allCancelled)
    ) {
      if (childBlocksParentAutomation(children)) {
        this.store.logHarnessEvent(parentId, 'parent-approval-blocked', {
          flaggedChildIds: children.filter(isApprovalFlagged).map((c) => c.id),
        });
        return parent;
      }
      const next = allCancelled
        ? 'todo'
        : parentStateAfterChildrenTerminal(parent);
      this.store.logHarnessEvent(parentId, 'parent-unblocked', {
        nextState: next,
        allCancelled,
      });
      const updated = this.setPointState(parentId, next, 'harness');
      if (!allCancelled) {
        await this.checkParentCompletion(parentId);
      }
      return updated;
    }

    return parent;
  }

  async runAgent(
    pointId: string,
    intent: AgentIntent,
    childId?: string,
  ): Promise<{ message: ThreadMessage | null; stateChanged?: PointState }> {
    const point = this.store.getPoint(pointId);
    if (!point) throw new Error('Point not found');

    this.setAgentRunning(pointId, true);
    try {
      return await this.runAgentInner(pointId, intent, childId, point);
    } finally {
      this.setAgentRunning(pointId, false);
    }
  }

  private async runAgentInner(
    pointId: string,
    intent: AgentIntent,
    childId: string | undefined,
    point: Point,
  ): Promise<{ message: ThreadMessage | null; stateChanged?: PointState }> {
    let prompt = promptForIntent(intent, point);
    if (intent === 'review' && childId) {
      const child = this.store.getPoint(childId);
      if (child) {
        prompt = promptForIntent(intent, point, {
          childTask: child.task,
          childPlan: child.description,
        });
      }
    }

    const sessionId = await this.ensurePointSession(pointId);
    const message = await this.rpc.sendMessage(sessionId, prompt, {
      mentionAgents: intent === 'review' ? ['code-reviewer'] : undefined,
    });

    let stateChanged: PointState | undefined;

    if (intent === 'plan' && point.state === 'todo') {
      const assistant = await this.awaitAssistantReply(sessionId, 12_000);
      let planText = point.description;
      if (assistant?.content) {
        const extracted = extractPlanFromContent(assistant.content);
        if (extracted) {
          planText = extracted;
        } else if (assistant.content.trim().length > planText.trim().length) {
          planText = assistant.content.trim();
        }
        if (planText.trim()) {
          this.store.updatePoint(pointId, { description: planText });
        }
      }
      if (planLooksReady(planText)) {
        const tr = transitionPoint(
          { ...point, description: planText },
          'needs-review',
          'agent',
        );
        if (tr.ok) {
          this.setPointState(pointId, 'needs-review', 'agent');
          stateChanged = 'needs-review';
          await this.onPointStateChange(pointId, 'needs-review', point.state);
        }
      }
    }

    if (intent === 'execute' && point.state === 'in-progress') {
      const assistant = await this.awaitAssistantReply(sessionId, 30_000);
      const parsed = assistant
        ? parseCompletionFromAgent(assistant.content)
        : null;
      const done =
        (assistant && /LINER_DONE:\s*yes/i.test(assistant.content)) ||
        parsed?.completed;
      if (done) {
        const current = this.store.getPoint(pointId) ?? point;
        const tr = transitionPoint(current, 'done', 'agent');
        if (tr.ok) {
          this.setPointState(pointId, 'done', 'agent');
          stateChanged = 'done';
          await this.onPointStateChange(pointId, 'done', current.state);
        }
      }
    }

    return { message, stateChanged };
  }

  async respondToPermission(
    pointId: string,
    requestId: string,
    approved: boolean,
  ): Promise<void> {
    const point = this.store.getPoint(pointId);
    if (!point?.sessionId) throw new Error('No session for point');
    if (!this.rpc.respondToPermission) {
      throw new Error('RPC adapter does not support permission responses');
    }
    await this.rpc.respondToPermission(
      point.sessionId,
      requestId,
      approved,
    );
  }

  async maybeTriggerPlanReview(child: Point): Promise<PlanReviewResult | null> {
    if (!child.parentId) return null;
    const parent = this.store.getPoint(child.parentId);
    if (!parent) return null;
    const siblings = this.store.getChildren(parent.id);
    if (siblings.length === 0) return null;

    this.store.logHarnessEvent(parent.id, 'plan-review-requested', {
      childId: child.id,
      childTask: child.task,
    });

    const result = this.options.onPlanReview
      ? await this.options.onPlanReview({ parent, child })
      : await this.llmOrHeuristicPlanReview(parent, child);

    this.store.logHarnessEvent(parent.id, 'plan-review-completed', {
      ...result,
    });

    if (parent.sessionId) {
      const advisory =
        result.verdict === 'approved'
          ? `Plan review **approved** for "${child.task}".`
          : `Plan review requests changes for "${child.task}": ${result.notes}`;
      await this.rpc.sendMessage(parent.sessionId, advisory, {
        collapsedTools: true,
      });
    }

    if (child.sessionId) {
      await this.rpc.sendMessage(
        child.sessionId,
        `_Parent plan review (${result.verdict}):_ ${result.notes}`,
        { collapsedTools: true },
      );
    }

    if (
      this.options.strictPlanGate &&
      result.verdict === 'changes_requested'
    ) {
      this.store.updatePoint(child.id, { state: 'todo' });
    }

    return result;
  }

  private async llmOrHeuristicPlanReview(
    parent: Point,
    child: Point,
  ): Promise<PlanReviewResult> {
    const sessionId = await this.ensurePointSession(parent.id);
    const prompt = promptForIntent('review', parent, {
      childTask: child.task,
      childPlan: child.description,
    });
    await this.rpc.sendMessage(sessionId, prompt, { collapsedTools: true });
    const reply = await this.awaitAssistantReply(sessionId, 12_000);
    const parsed = reply ? parsePlanReviewJson(reply.content) : null;
    if (parsed) {
      return {
        verdict: parsed.verdict,
        notes: parsed.notes,
        parentPointId: parent.id,
        childPointId: child.id,
      };
    }
    return this.defaultPlanReview(parent, child);
  }

  private defaultPlanReview(parent: Point, child: Point): PlanReviewResult {
    const hasPlan = child.description.trim().length > 20;
    return {
      verdict: hasPlan ? 'approved' : 'changes_requested',
      notes: hasPlan
        ? 'Child plan has sufficient detail.'
        : 'Expand the child plan before human review.',
      parentPointId: parent.id,
      childPointId: child.id,
    };
  }

  async checkParentCompletion(parentId: string): Promise<void> {
    const parent = this.store.getPoint(parentId);
    if (!parent) return;
    const children = this.store.getChildren(parentId);
    if (!allChildrenTerminal(children)) return;
    if (childBlocksParentAutomation(children)) return;

    this.store.logHarnessEvent(parentId, 'completion-verification-requested', {
      childCount: children.length,
    });

    const result = this.options.onCompletionVerification
      ? await this.options.onCompletionVerification({ parent, children })
      : await this.llmOrHeuristicCompletion(parent, children);

    this.store.logHarnessEvent(parentId, 'completion-verification-completed', {
      ...result,
    });

    if (parent.sessionId) {
      const body = result.completed
        ? `**Completion verified.** ${result.summary}`
        : `**Completion gaps:**\n${result.gaps.map((g) => `- ${g}`).join('\n')}\n\n${result.summary}`;
      await this.rpc.sendMessage(parent.sessionId, body, {
        collapsedTools: true,
      });
    }

    const nextState: PointState = result.completed ? 'done' : 'in-progress';
    let current = parent;
    if (
      result.completed &&
      current.state === 'needs-review' &&
      canTransition(current.state, 'in-progress', 'human')
    ) {
      current = this.setPointState(parentId, 'in-progress', 'harness') ?? current;
    }
    const actor = result.completed ? 'agent' : 'harness';
    const tr = transitionPoint(current, nextState, actor);
    if (tr.ok) {
      this.setPointState(parentId, tr.state, actor);
    }
  }

  private async llmOrHeuristicCompletion(
    parent: Point,
    children: Point[],
  ): Promise<CompletionVerificationResult> {
    const sessionId = await this.ensurePointSession(parent.id);
    const childSummary = children
      .map((c) => `- ${c.task}: ${c.state}`)
      .join('\n');
    const prompt = [
      'Verify whether all child tasks are complete enough for the parent to mark done.',
      'Respond with JSON only:',
      '{"completed":true|false,"summary":"...","gaps":["..."]}',
      '',
      `Parent: ${parent.task}`,
      '',
      '## Children',
      childSummary,
    ].join('\n');

    await this.rpc.sendMessage(sessionId, prompt, { collapsedTools: true });
    const reply = await this.awaitAssistantReply(sessionId, 12_000);
    if (reply) {
      const parsed = parseCompletionFromAgent(reply.content);
      const jsonMatch = reply.content.match(/\{[\s\S]*"completed"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const j = JSON.parse(jsonMatch[0]) as {
            completed?: boolean;
            summary?: string;
            gaps?: string[];
          };
          return {
            completed: Boolean(j.completed),
            summary: String(j.summary ?? parsed.summary),
            gaps: Array.isArray(j.gaps) ? j.gaps.map(String) : parsed.gaps,
          };
        } catch {
          /* fall through */
        }
      }
      if (parsed.completed || parsed.gaps.length > 0) {
        return {
          completed: parsed.completed,
          summary: parsed.summary,
          gaps: parsed.gaps,
        };
      }
    }
    return this.defaultCompletionVerification(parent, children);
  }

  private defaultCompletionVerification(
    parent: Point,
    children: Point[],
  ): CompletionVerificationResult {
    const incomplete = children.filter(
      (c) => c.state !== 'shipped' && c.state !== 'cancelled',
    );
    const cancelled = children.filter((c) => c.state === 'cancelled').length;
    const shipped = children.filter((c) => c.state === 'shipped').length;
    return {
      completed: incomplete.length === 0 && shipped > 0,
      summary: `Parent "${parent.task}": ${shipped} shipped, ${cancelled} cancelled of ${children.length} children.`,
      gaps:
        incomplete.length > 0
          ? incomplete.map((c) => `${c.task} is ${c.state}`)
          : [],
    };
  }

  async ensurePointSession(pointId: string): Promise<string> {
    const point = this.store.getPoint(pointId);
    if (!point) throw new Error('Point not found');
    const context = buildSessionContext(this.store, pointId);
    const sessionId = await this.rpc.ensureSession(point.sessionId, {
      title: sessionTitleForPoint(point),
      context: point.sessionId ? undefined : context,
    });
    if (sessionId !== point.sessionId) {
      this.store.updatePoint(pointId, { sessionId });
    }
    return sessionId;
  }

  private awaitAssistantReply(
    sessionId: string,
    timeoutMs: number,
  ): Promise<ThreadMessage | null> {
    return new Promise((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          unsub();
          resolve(null);
        }
      }, timeoutMs);

      const unsub = this.rpc.subscribe(sessionId, (msg) => {
        if (msg.role === 'assistant' && !msg.meta?.streaming) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            unsub();
            resolve(msg);
          }
        }
      });
    });
  }
}
