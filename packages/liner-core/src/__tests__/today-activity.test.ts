import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { OutlineStore } from '../store';

function storeWithArea(): { store: OutlineStore; areaId: string } {
  const store = new OutlineStore('test-today', new Database(':memory:'));
  const areaId = store.listAreas()[0]!.id;
  return { store, areaId };
}

describe('today activity', () => {
  test('touchPoint bumps updated_at', () => {
    const { store, areaId } = storeWithArea();
    const point = store.createPoint({ task: 'Touch me', areaId });
    const before = point.updatedAt;

    store.db.run('UPDATE points SET updated_at = ? WHERE id = ?', [
      '2000-01-01T00:00:00.000Z',
      point.id,
    ]);

    const touched = store.touchPoint(point.id);
    expect(touched).not.toBeNull();
    expect(touched!.updatedAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(touched!.updatedAt >= before).toBe(true);
    expect(touched!.task).toBe('Touch me');
  });

  test('listPointsWorkedSince includes touched and created today', () => {
    const { store, areaId } = storeWithArea();
    const since = '2026-05-21T00:00:00.000Z';

    const old = store.createPoint({ task: 'Old', areaId });
    store.db.run('UPDATE points SET updated_at = ?, created_at = ? WHERE id = ?', [
      '2026-05-20T12:00:00.000Z',
      '2026-05-20T12:00:00.000Z',
      old.id,
    ]);

    const fresh = store.createPoint({ task: 'Fresh', areaId });
    store.touchPoint(fresh.id);

    const worked = store.listPointsWorkedSince(since);
    const ids = worked.map((p) => p.id);
    expect(ids).toContain(fresh.id);
    expect(ids).not.toContain(old.id);
  });

  test('logHarnessEvent touches point for today query', () => {
    const { store, areaId } = storeWithArea();
    const since = '2026-05-21T00:00:00.000Z';
    const point = store.createPoint({ task: 'Harness', areaId });
    store.db.run('UPDATE points SET updated_at = ?, created_at = ? WHERE id = ?', [
      '2026-05-20T12:00:00.000Z',
      '2026-05-20T12:00:00.000Z',
      point.id,
    ]);

    store.logHarnessEvent(point.id, 'parent-waiting', {});

    const worked = store.listPointsWorkedSince(since);
    expect(worked.some((p) => p.id === point.id)).toBe(true);
  });
});
