import Database from "better-sqlite3";

// ── Node and edge kind enums (for documentation, enforced by CHECK) ──

export const NODE_KINDS = ["message", "conversation", "topic", "decision", "artifact", "task"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const EDGE_KINDS = [
  "contains", "spawned", "assigned_in", "reply_to", "led_to",
  "discussed_in", "decided_in", "implemented_by", "references", "related_to",
] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

// ── P1: Body truncation constant ─────────────────────────────────────

export const MAX_BODY_BYTES = 50 * 1024; // 50 KB

// ── DDL ──────────────────────────────────────────────────────────────

export const MEMORY_MIGRATIONS = `
CREATE TABLE IF NOT EXISTS nodes (
  id           TEXT PRIMARY KEY,
  repo         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('message','conversation','topic','decision','artifact','task')),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  meta         TEXT NOT NULL DEFAULT '{}',
  source_id    TEXT NOT NULL,
  source_type  TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nodes_repo      ON nodes(repo);
CREATE INDEX IF NOT EXISTS idx_nodes_repo_kind ON nodes(repo, kind);
CREATE INDEX IF NOT EXISTS idx_nodes_source    ON nodes(source_type, source_id);

CREATE TABLE IF NOT EXISTS edges (
  id         TEXT PRIMARY KEY,
  repo       TEXT NOT NULL,
  from_node  TEXT NOT NULL,
  to_node    TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('contains','spawned','assigned_in','reply_to','led_to','discussed_in','decided_in','implemented_by','references','related_to')),
  weight     REAL NOT NULL DEFAULT 1.0,
  meta       TEXT NOT NULL DEFAULT '{}',
  auto       INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edges_repo      ON edges(repo);
CREATE INDEX IF NOT EXISTS idx_edges_from      ON edges(from_node);
CREATE INDEX IF NOT EXISTS idx_edges_to        ON edges(to_node);
CREATE INDEX IF NOT EXISTS idx_edges_repo_kind ON edges(repo, kind);
CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_unique ON edges(from_node, to_node, kind);

-- FTS5 virtual table for full-text search on node title + body
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  title,
  body,
  content='nodes',
  content_rowid='rowid'
);

-- Triggers to keep FTS5 in sync with nodes table
CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
END;

CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO nodes_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

-- Ingestion cursors for idempotent re-runs (composite PK: id + repo)
CREATE TABLE IF NOT EXISTS ingestion_cursors (
  id          TEXT NOT NULL,
  repo        TEXT NOT NULL,
  cursor      TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (id, repo)
);
`;

// ── Factory ──────────────────────────────────────────────────────────

export function createMemoryDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(MEMORY_MIGRATIONS);
  return db;
}
