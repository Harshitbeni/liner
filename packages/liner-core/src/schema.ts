export const SCHEMA_VERSION = 1;

export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
  )`,
  `CREATE TABLE IF NOT EXISTS areas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS points (
    id TEXT PRIMARY KEY,
    task TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT 'backlog',
    priority TEXT NOT NULL DEFAULT 'none',
    area_id TEXT NOT NULL,
    session_id TEXT,
    parent_id TEXT,
    child_ids TEXT NOT NULL DEFAULT '[]',
    meta TEXT NOT NULL DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (area_id) REFERENCES areas(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_points_area ON points(area_id)`,
  `CREATE INDEX IF NOT EXISTS idx_points_parent ON points(parent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_points_state ON points(state)`,
  `CREATE TABLE IF NOT EXISTS harness_events (
    id TEXT PRIMARY KEY,
    point_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (point_id) REFERENCES points(id)
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS thread_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    meta TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_thread_messages_session ON thread_messages(session_id)`,
];
