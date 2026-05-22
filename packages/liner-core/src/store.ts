import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { v4 as uuid } from 'uuid';
import { dbPath, DEFAULT_WORKSPACE_ID } from './paths';
import { MIGRATIONS, SCHEMA_VERSION } from './schema';
import type {
  Area,
  HarnessEvent,
  HarnessEventType,
  LinerSettings,
  Point,
  PointPriority,
  PointState,
} from './types.ts';

function now(): string {
  return new Date().toISOString();
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToPoint(row: Record<string, unknown>): Point {
  return {
    id: row.id as string,
    task: row.task as string,
    description: row.description as string,
    notes: row.notes as string,
    state: row.state as PointState,
    priority: row.priority as PointPriority,
    areaId: row.area_id as string,
    sessionId: (row.session_id as string | null) ?? null,
    parentId: (row.parent_id as string | null) ?? null,
    childIds: parseJson(row.child_ids as string, []),
    meta: parseJson(row.meta as string, {}),
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToArea(row: Record<string, unknown>): Area {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    icon: (row.icon as string | undefined) ?? undefined,
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class OutlineStore {
  readonly db: Database;
  readonly workspaceId: string;

  constructor(workspaceId = DEFAULT_WORKSPACE_ID, database?: Database) {
    this.workspaceId = workspaceId;
    if (database) {
      this.db = database;
    } else {
      const path = dbPath(workspaceId);
      mkdirSync(dirname(path), { recursive: true });
      this.db = new Database(path);
      this.db.run('PRAGMA busy_timeout = 5000');
    }
    this.migrate();
  }

  migrate(): void {
    for (const sql of MIGRATIONS) {
      this.db.run(sql);
    }
    const version = this.db
      .query('SELECT version FROM schema_version LIMIT 1')
      .get() as { version: number } | null;
    if (!version) {
      this.db.run('INSERT INTO schema_version (version) VALUES (?)', [
        SCHEMA_VERSION,
      ]);
      this.seedDefaults();
    }
  }

  private seedDefaults(): void {
    const areaId = uuid();
    const ts = now();
    this.db.run(
      `INSERT INTO areas (id, name, description, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
      [areaId, 'Inbox', 'Default workspace area for captured tasks.', ts, ts],
    );
    this.setSettings({
      workspaceId: this.workspaceId,
      defaultAreaId: areaId,
      theme: 'system',
      strictPlanGate: false,
      autoAgents: true,
      opencodeBaseUrl: 'http://127.0.0.1:4096',
      aiProviderId: 'anthropic',
    });
  }

  getSettings(): LinerSettings {
    const rows = this.db.query('SELECT key, value FROM settings').all() as {
      key: string;
      value: string;
    }[];
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      workspaceId: map.workspaceId ?? this.workspaceId,
      defaultAreaId: map.defaultAreaId ?? null,
      theme: (map.theme as LinerSettings['theme']) ?? 'system',
      strictPlanGate: map.strictPlanGate === 'true',
      autoAgents: map.autoAgents !== 'false',
      opencodeBaseUrl:
        map.opencodeBaseUrl ??
        (map.craftRpcUrl?.startsWith('http')
          ? map.craftRpcUrl
          : 'http://127.0.0.1:4096'),
      aiProviderId: map.aiProviderId ?? 'anthropic',
    };
  }

  setSettings(partial: Partial<LinerSettings>): LinerSettings {
    const current = this.getSettings();
    const next = { ...current, ...partial };
    const entries: [string, string][] = [
      ['workspaceId', next.workspaceId],
      ['defaultAreaId', next.defaultAreaId ?? ''],
      ['theme', next.theme],
      ['strictPlanGate', String(next.strictPlanGate)],
      ['autoAgents', String(next.autoAgents)],
      ['opencodeBaseUrl', next.opencodeBaseUrl],
      ['aiProviderId', next.aiProviderId],
    ];
    for (const [key, value] of entries) {
      this.db.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, value],
      );
    }
    return next;
  }

  listAreas(): Area[] {
    const rows = this.db
      .query('SELECT * FROM areas ORDER BY sort_order ASC, name ASC')
      .all() as Record<string, unknown>[];
    return rows.map(rowToArea);
  }

  getArea(id: string): Area | null {
    const row = this.db.query('SELECT * FROM areas WHERE id = ?').get(id) as
      | Record<string, unknown>
      | null;
    return row ? rowToArea(row) : null;
  }

  createArea(input: {
    name: string;
    description?: string;
    icon?: string;
  }): Area {
    const id = uuid();
    const ts = now();
    const maxOrder =
      (this.db.query('SELECT MAX(sort_order) as m FROM areas').get() as {
        m: number | null;
      })?.m ?? -1;
    this.db.run(
      `INSERT INTO areas (id, name, description, icon, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        input.description ?? '',
        input.icon ?? null,
        maxOrder + 1,
        ts,
        ts,
      ],
    );
    return this.getArea(id)!;
  }

  updateArea(
    id: string,
    patch: Partial<Pick<Area, 'name' | 'description' | 'icon' | 'sortOrder'>>,
  ): Area | null {
    const existing = this.getArea(id);
    if (!existing) return null;
    const ts = now();
    this.db.run(
      `UPDATE areas SET name = ?, description = ?, icon = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
      [
        patch.name ?? existing.name,
        patch.description ?? existing.description,
        patch.icon ?? existing.icon ?? null,
        patch.sortOrder ?? existing.sortOrder,
        ts,
        id,
      ],
    );
    return this.getArea(id);
  }

  listPoints(filters?: {
    areaId?: string;
    parentId?: string | null;
    state?: PointState;
  }): Point[] {
    let sql = 'SELECT * FROM points WHERE 1=1';
    const params: (string | number | null)[] = [];
    if (filters?.areaId) {
      sql += ' AND area_id = ?';
      params.push(filters.areaId);
    }
    if (filters && 'parentId' in filters) {
      if (filters.parentId === null) {
        sql += ' AND parent_id IS NULL';
      } else if (filters.parentId) {
        sql += ' AND parent_id = ?';
        params.push(filters.parentId);
      }
    }
    if (filters?.state) {
      sql += ' AND state = ?';
      params.push(filters.state);
    }
    sql += ' ORDER BY sort_order ASC, created_at ASC';
    const rows = this.db.query(sql).all(...params) as Record<string, unknown>[];
    return rows.map(rowToPoint);
  }

  getPoint(id: string): Point | null {
    const row = this.db.query('SELECT * FROM points WHERE id = ?').get(id) as
      | Record<string, unknown>
      | null;
    return row ? rowToPoint(row) : null;
  }

  createPoint(input: {
    task: string;
    areaId: string;
    parentId?: string | null;
    description?: string;
    notes?: string;
    state?: PointState;
    priority?: PointPriority;
    sessionId?: string | null;
  }): Point {
    const id = uuid();
    const ts = now();
    let sortOrder = 0;
    if (input.parentId) {
      const parent = this.getPoint(input.parentId);
      if (parent) {
        sortOrder = parent.childIds.length;
        const childIds = [...parent.childIds, id];
        this.db.run(
          'UPDATE points SET child_ids = ?, updated_at = ? WHERE id = ?',
          [JSON.stringify(childIds), ts, parent.id],
        );
      }
    } else {
      const max = this.db
        .query(
          'SELECT MAX(sort_order) as m FROM points WHERE area_id = ? AND parent_id IS NULL',
        )
        .get(input.areaId) as { m: number | null };
      sortOrder = (max?.m ?? -1) + 1;
    }
    this.db.run(
      `INSERT INTO points (
        id, task, description, notes, state, priority, area_id, session_id,
        parent_id, child_ids, meta, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '{}', ?, ?, ?)`,
      [
        id,
        input.task,
        input.description ?? '',
        input.notes ?? '',
        input.state ?? 'backlog',
        input.priority ?? 'none',
        input.areaId,
        input.sessionId ?? null,
        input.parentId ?? null,
        sortOrder,
        ts,
        ts,
      ],
    );
    return this.getPoint(id)!;
  }

  updatePoint(
    id: string,
    patch: Partial<
      Pick<
        Point,
        | 'task'
        | 'description'
        | 'notes'
        | 'state'
        | 'priority'
        | 'areaId'
        | 'sessionId'
        | 'meta'
        | 'sortOrder'
      >
    >,
  ): Point | null {
    const existing = this.getPoint(id);
    if (!existing) return null;
    const ts = now();
    this.db.run(
      `UPDATE points SET
        task = ?, description = ?, notes = ?, state = ?, priority = ?,
        area_id = ?, session_id = ?, meta = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
      [
        patch.task ?? existing.task,
        patch.description ?? existing.description,
        patch.notes ?? existing.notes,
        patch.state ?? existing.state,
        patch.priority ?? existing.priority,
        patch.areaId ?? existing.areaId,
        patch.sessionId !== undefined ? patch.sessionId : existing.sessionId,
        JSON.stringify(
          patch.meta ? { ...existing.meta, ...patch.meta } : existing.meta,
        ),
        patch.sortOrder ?? existing.sortOrder,
        ts,
        id,
      ],
    );
    return this.getPoint(id);
  }

  deletePoint(id: string): boolean {
    const point = this.getPoint(id);
    if (!point) return false;
    const ts = now();
    if (point.parentId) {
      const parent = this.getPoint(point.parentId);
      if (parent) {
        const childIds = parent.childIds.filter((c) => c !== id);
        this.db.run(
          'UPDATE points SET child_ids = ?, updated_at = ? WHERE id = ?',
          [JSON.stringify(childIds), ts, parent.id],
        );
      }
    }
    for (const childId of [...point.childIds]) {
      this.deletePoint(childId);
    }
    this.db.run('DELETE FROM points WHERE id = ?', [id]);
    return true;
  }

  reorderChildren(parentId: string, childIds: string[]): Point | null {
    const parent = this.getPoint(parentId);
    if (!parent) return null;
    const ts = now();
    this.db.run(
      'UPDATE points SET child_ids = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(childIds), ts, parentId],
    );
    childIds.forEach((cid, index) => {
      this.db.run('UPDATE points SET sort_order = ? WHERE id = ?', [
        index,
        cid,
      ]);
    });
    return this.getPoint(parentId);
  }

  /** True if `ancestorId` appears on the parent chain above `nodeId`. */
  private isAncestorOf(ancestorId: string, nodeId: string): boolean {
    let cursor: string | null = nodeId;
    while (cursor) {
      if (cursor === ancestorId) return true;
      const p = this.getPoint(cursor);
      cursor = p?.parentId ?? null;
    }
    return false;
  }

  private setParentChildIds(parentId: string, childIds: string[], ts: string) {
    this.db.run(
      'UPDATE points SET child_ids = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(childIds), ts, parentId],
    );
    childIds.forEach((cid, index) => {
      this.db.run('UPDATE points SET sort_order = ? WHERE id = ?', [
        index,
        cid,
      ]);
    });
  }

  movePoint(
    id: string,
    newParentId: string | null,
    afterSiblingId?: string | null,
  ): Point | null {
    const point = this.getPoint(id);
    if (!point) return null;

    if (newParentId === id) return null;
    if (newParentId && this.isAncestorOf(id, newParentId)) return null;

    const ts = now();
    const oldParentId = point.parentId;

    if (oldParentId) {
      const oldParent = this.getPoint(oldParentId);
      if (oldParent) {
        this.setParentChildIds(
          oldParentId,
          oldParent.childIds.filter((c) => c !== id),
          ts,
        );
      }
    }

    let orderedIds: string[];
    if (newParentId) {
      const newParent = this.getPoint(newParentId);
      if (!newParent) return null;
      orderedIds = newParent.childIds.filter((c) => c !== id);
      const insertAt =
        afterSiblingId != null
          ? orderedIds.indexOf(afterSiblingId) + 1
          : orderedIds.length;
      const at = insertAt < 0 ? orderedIds.length : insertAt;
      orderedIds.splice(at, 0, id);
      this.setParentChildIds(newParentId, orderedIds, ts);
    } else {
      orderedIds = this.listPoints({ areaId: point.areaId, parentId: null })
        .map((p) => p.id)
        .filter((cid) => cid !== id);
      const insertAt =
        afterSiblingId != null
          ? orderedIds.indexOf(afterSiblingId) + 1
          : orderedIds.length;
      const at = insertAt < 0 ? orderedIds.length : insertAt;
      orderedIds.splice(at, 0, id);
      orderedIds.forEach((cid, index) => {
        this.db.run('UPDATE points SET sort_order = ? WHERE id = ?', [
          index,
          cid,
        ]);
      });
    }

    const sortOrder = orderedIds.indexOf(id);
    this.db.run(
      'UPDATE points SET parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?',
      [newParentId, sortOrder, ts, id],
    );
    return this.getPoint(id);
  }

  getChildren(pointId: string): Point[] {
    const point = this.getPoint(pointId);
    if (!point) return [];
    return point.childIds
      .map((id) => this.getPoint(id))
      .filter((p): p is Point => p !== null);
  }

  /** Bump updated_at without changing other fields (chat, harness, etc.). */
  touchPoint(pointId: string): Point | null {
    const existing = this.getPoint(pointId);
    if (!existing) return null;
    const ts = now();
    this.db.run('UPDATE points SET updated_at = ? WHERE id = ?', [ts, pointId]);
    return this.getPoint(pointId);
  }

  listPointsWorkedSince(since: string): Point[] {
    const rows = this.db
      .query(
        `SELECT * FROM points
         WHERE updated_at >= ? OR created_at >= ?
         ORDER BY updated_at DESC`,
      )
      .all(since, since) as Record<string, unknown>[];
    return rows.map(rowToPoint);
  }

  logHarnessEvent(
    pointId: string,
    type: HarnessEventType,
    payload: Record<string, unknown> = {},
  ): HarnessEvent {
    const id = uuid();
    const ts = now();
    this.db.run(
      'INSERT INTO harness_events (id, point_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, pointId, type, JSON.stringify(payload), ts],
    );
    this.touchPoint(pointId);
    return {
      id,
      pointId,
      type,
      payload,
      createdAt: ts,
    };
  }

  listHarnessEvents(pointId: string, limit = 50): HarnessEvent[] {
    const rows = this.db
      .query(
        'SELECT * FROM harness_events WHERE point_id = ? ORDER BY created_at DESC LIMIT ?',
      )
      .all(pointId, limit) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row.id as string,
      pointId: row.point_id as string,
      type: row.type as HarnessEventType,
      payload: parseJson(row.payload as string, {}),
      createdAt: row.created_at as string,
    }));
  }
}
