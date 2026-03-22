import Database from "better-sqlite3";
import { join } from "node:path";

export const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  conversation  TEXT NOT NULL,
  sender        TEXT NOT NULL,
  recipient     TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('context', 'task', 'status', 'reply')),
  payload       TEXT NOT NULL,
  meta_prompt   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  read_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation);
CREATE INDEX IF NOT EXISTS idx_messages_recipient    ON messages(recipient, read_at);

CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY,
  conversation    TEXT NOT NULL,
  domain          TEXT NOT NULL,
  summary         TEXT NOT NULL,
  details         TEXT NOT NULL,
  analysis        TEXT,
  assigned_to     TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_conversation ON tasks(conversation);
CREATE INDEX IF NOT EXISTS idx_tasks_status       ON tasks(status);
`;

export function createDatabase(dbPath?: string): Database.Database {
  /* v8 ignore next */
  const resolvedPath = dbPath ?? join(process.cwd(), "bridge.db");
  const db = new Database(resolvedPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(MIGRATIONS);

  return db;
}
