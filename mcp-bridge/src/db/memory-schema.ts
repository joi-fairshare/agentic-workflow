import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

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

// MEMORY_MIGRATIONS is a single-version schema (v1) applied atomically via db.exec().
// Future schema changes should introduce a `schema_version` table and numbered migration
// statements so versions can be applied incrementally without re-running prior DDL.
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
  sender       TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nodes_repo        ON nodes(repo);
CREATE INDEX IF NOT EXISTS idx_nodes_repo_kind   ON nodes(repo, kind);
CREATE INDEX IF NOT EXISTS idx_nodes_repo_sender ON nodes(repo, sender);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_source ON nodes(source_type, source_id);

CREATE TABLE IF NOT EXISTS edges (
  id         TEXT PRIMARY KEY,
  repo       TEXT NOT NULL,
  from_node  TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_node    TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
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

-- FTS5 external-content table for full-text search on node title + body.
-- The content='nodes' + content_rowid='rowid' pattern means FTS5 stores only the index,
-- not the raw text -- the rowid-based join back to the nodes table is the standard SQLite
-- FTS5 external content pattern. Correctness depends on the INSERT/DELETE/UPDATE triggers
-- below keeping the index in sync; without them queries would return stale data.
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

-- Vector embeddings (requires sqlite-vec extension loaded before exec)
CREATE VIRTUAL TABLE IF NOT EXISTS node_embeddings USING vec0(
  node_id TEXT PRIMARY KEY,
  embedding float[768]
);

CREATE TABLE IF NOT EXISTS traversal_logs (
  id TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  agent TEXT NOT NULL DEFAULT 'anonymous',
  operation TEXT NOT NULL CHECK(operation IN ('traverse', 'context')),
  start_node TEXT,
  params TEXT NOT NULL,
  steps TEXT NOT NULL,
  scores TEXT,
  token_allocation TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (start_node) REFERENCES nodes(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_traversal_logs_repo_created ON traversal_logs(repo, created_at DESC);
`;

// ── Factory ──────────────────────────────────────────────────────────

export function createMemoryDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  sqliteVec.load(db);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(MEMORY_MIGRATIONS);
  return db;
}
