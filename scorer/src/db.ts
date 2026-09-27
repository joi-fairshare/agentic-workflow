import Database from "better-sqlite3";

export type Db = Database.Database;

export const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  offset INTEGER NOT NULL,
  size INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS calls (
  file TEXT NOT NULL,
  message_id TEXT NOT NULL,
  project TEXT NOT NULL,
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  is_main INTEGER NOT NULL,
  model TEXT NOT NULL,
  ts TEXT NOT NULL,
  input INTEGER NOT NULL,
  cache_read INTEGER NOT NULL,
  cache_creation INTEGER NOT NULL,
  output INTEGER NOT NULL,
  PRIMARY KEY (file, message_id)
);
CREATE INDEX IF NOT EXISTS calls_ts ON calls(ts);
CREATE INDEX IF NOT EXISTS calls_file_ts ON calls(file, ts);
CREATE TABLE IF NOT EXISTS events (
  file TEXT NOT NULL,
  uuid TEXT NOT NULL,
  kind TEXT NOT NULL,
  session_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  detail TEXT,
  PRIMARY KEY (file, uuid, kind)
);
CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
CREATE TABLE IF NOT EXISTS pr_links (
  file TEXT NOT NULL,
  session_id TEXT NOT NULL,
  repo TEXT NOT NULL,
  number INTEGER NOT NULL,
  ts TEXT NOT NULL,
  PRIMARY KEY (session_id, repo, number)
);
CREATE TABLE IF NOT EXISTS pr_state (
  repo TEXT NOT NULL,
  number INTEGER NOT NULL,
  state TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (repo, number)
);
CREATE TABLE IF NOT EXISTS startup_ctx (
  file TEXT NOT NULL,
  uuid TEXT NOT NULL,
  session_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL,
  chars INTEGER NOT NULL,
  PRIMARY KEY (file, uuid, source)
);
CREATE INDEX IF NOT EXISTS startup_ctx_ts ON startup_ctx(ts);
CREATE INDEX IF NOT EXISTS startup_ctx_category ON startup_ctx(category);
`;

export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 2000");
  db.exec(MIGRATIONS);
  return db;
}
