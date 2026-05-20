import { describe, expect, test } from 'bun:test';
import { HarnessOrchestrator } from '../harness';
import { OutlineStore } from '../store';
import { MockSessionRpcAdapter } from '../rpc/mock-adapter';
describe('HarnessOrchestrator', () => {
  test('parent unblocks from waiting when all children cancelled', async () => {
    const store = new OutlineStore('test-harness-cancel-all');
    const rpc = new MockSessionRpcAdapter();
    await rpc.connect();
    const harness = new HarnessOrchestrator(store, rpc);

    const area = store.listAreas()[0];
    const parent = store.createPoint({
      task: 'Parent cancelled kids',
      areaId: area.id,
      state: 'waiting',
    });
    store.createPoint({
      task: 'Child A',
      areaId: area.id,
      parentId: parent.id,
      state: 'cancelled',
    });
    store.createPoint({
      task: 'Child B',
      areaId: area.id,
      parentId: parent.id,
      state: 'cancelled',
    });

    await harness.syncParentFromChildren(parent.id);
    expect(store.getPoint(parent.id)?.state).toBe('todo');
  });

  test('parent enters waiting when child is in-progress', async () => {
    const store = new OutlineStore('test-harness-wait');
    const rpc = new MockSessionRpcAdapter();
    await rpc.connect();
    const harness = new HarnessOrchestrator(store, rpc);

    const area = store.listAreas()[0];
    const parent = store.createPoint({
      task: 'Parent',
      areaId: area.id,
      state: 'in-progress',
    });
    store.createPoint({
      task: 'Child',
      areaId: area.id,
      parentId: parent.id,
      state: 'in-progress',
    });

    await harness.syncParentFromChildren(parent.id);
    const updated = store.getPoint(parent.id);
    expect(updated?.state).toBe('waiting');
  });

  test('plan review uses heuristic when mock has no JSON', async () => {
    const store = new OutlineStore('test-harness-review');
    const rpc = new MockSessionRpcAdapter();
    await rpc.connect();
    const harness = new HarnessOrchestrator(store, rpc);

    const area = store.listAreas()[0];
    const parent = store.createPoint({
      task: 'Parent review',
      areaId: area.id,
      state: 'in-progress',
    });
    const child = store.createPoint({
      task: 'Child',
      areaId: area.id,
      parentId: parent.id,
      state: 'needs-review',
      description: 'Short',
    });

    const result = await harness.maybeTriggerPlanReview(child);
    expect(result?.verdict).toBe('changes_requested');
  });

  test('completion verification marks parent done when children shipped', async () => {
    const store = new OutlineStore('test-harness-complete');
    const rpc = new MockSessionRpcAdapter();
    await rpc.connect();
    const harness = new HarnessOrchestrator(store, rpc);

    const area = store.listAreas()[0];
    const parent = store.createPoint({
      task: 'Ship parent',
      areaId: area.id,
      state: 'waiting',
      description: 'Plan exists here for review path',
    });
    store.createPoint({
      task: 'Child A',
      areaId: area.id,
      parentId: parent.id,
      state: 'shipped',
    });
    store.createPoint({
      task: 'Child B',
      areaId: area.id,
      parentId: parent.id,
      state: 'cancelled',
    });

    await harness.syncParentFromChildren(parent.id);
    await harness.checkParentCompletion(parent.id);
    const updated = store.getPoint(parent.id);
    expect(updated?.state).toBe('done');
  });

  test('maybeAutoRunAgent runs plan on todo with empty description', async () => {
    const store = new OutlineStore('test-harness-auto-plan');
    const rpc = new MockSessionRpcAdapter();
    await rpc.connect();
    const harness = new HarnessOrchestrator(store, rpc);

    const area = store.listAreas()[0];
    const point = store.createPoint({
      task: 'Auto plan',
      areaId: area.id,
      state: 'backlog',
    });
    store.updatePoint(point.id, { state: 'todo' });

    const result = await harness.maybeAutoRunAgent(point.id, 'todo', 'backlog');
    expect(result).not.toBeNull();
    expect(store.getPoint(point.id)?.sessionId).not.toBeNull();
  });

  test('maybeAutoRunAgent runs execute when human approves to in-progress', async () => {
    const store = new OutlineStore('test-harness-auto-exec');
    const rpc = new MockSessionRpcAdapter();
    await rpc.connect();
    const harness = new HarnessOrchestrator(store, rpc);

    const area = store.listAreas()[0];
    const point = store.createPoint({
      task: 'Auto execute',
      areaId: area.id,
      state: 'needs-review',
      description: 'Step one: do work. Step two: verify. Step three: ship.',
    });

    const result = await harness.maybeAutoRunAgent(
      point.id,
      'in-progress',
      'needs-review',
    );
    expect(result).not.toBeNull();
    expect(harness.isAgentRunning(point.id)).toBe(false);
  });

  test('maybeAutoRunAgent skipped when autoAgents disabled', async () => {
    const store = new OutlineStore('test-harness-auto-off');
    store.setSettings({ autoAgents: false });
    const rpc = new MockSessionRpcAdapter();
    await rpc.connect();
    const harness = new HarnessOrchestrator(store, rpc);

    const area = store.listAreas()[0];
    const point = store.createPoint({
      task: 'No auto',
      areaId: area.id,
      state: 'todo',
    });

    const result = await harness.maybeAutoRunAgent(point.id, 'todo', 'backlog');
    expect(result).toBeNull();
  });

  test('runAgent plan promotes todo when description already sufficient', async () => {
    const store = new OutlineStore('test-harness-plan');
    const rpc = new MockSessionRpcAdapter();
    await rpc.connect();
    const harness = new HarnessOrchestrator(store, rpc);

    const area = store.listAreas()[0];
    const point = store.createPoint({
      task: 'Plan me',
      areaId: area.id,
      state: 'todo',
      description:
        'Step one: implement feature. Step two: verify tests. Step three: document rollout criteria and risks.',
    });

    const { stateChanged } = await harness.runAgent(point.id, 'plan');
    expect(stateChanged).toBe('needs-review');
    expect(store.getPoint(point.id)?.sessionId).not.toBeNull();
  });
});
