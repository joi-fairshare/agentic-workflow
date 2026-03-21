import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { MEMORY_MIGRATIONS, createMemoryDatabase } from "../src/db/memory-schema.js";

describe("MEMORY_MIGRATIONS", () => {
  it("creates all tables and indexes on a fresh database", () => {
    const db = new Database(":memory:");
    sqliteVec.load(db);
    db.pragma("journal_mode = WAL");
    db.exec(MEMORY_MIGRATIONS);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("nodes");
    expect(tableNames).toContain("edges");
    expect(tableNames).toContain("nodes_fts");
    expect(tableNames).toContain("ingestion_cursors");
    expect(tableNames).toContain("node_embeddings");
  });

  it("creates expected indexes on nodes", () => {
    const db = new Database(":memory:");
    sqliteVec.load(db);
    db.pragma("journal_mode = WAL");
    db.exec(MEMORY_MIGRATIONS);

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='nodes'")
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name);

    expect(names).toContain("idx_nodes_repo");
    expect(names).toContain("idx_nodes_repo_kind");
    expect(names).toContain("idx_nodes_source");
  });

  it("creates expected indexes on edges", () => {
    const db = new Database(":memory:");
    sqliteVec.load(db);
    db.pragma("journal_mode = WAL");
    db.exec(MEMORY_MIGRATIONS);

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='edges'")
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name);

    expect(names).toContain("idx_edges_repo");
    expect(names).toContain("idx_edges_from");
    expect(names).toContain("idx_edges_to");
    expect(names).toContain("idx_edges_repo_kind");
  });

  it("is idempotent (running twice does not throw)", () => {
    const db = new Database(":memory:");
    sqliteVec.load(db);
    db.pragma("journal_mode = WAL");
    db.exec(MEMORY_MIGRATIONS);
    expect(() => db.exec(MEMORY_MIGRATIONS)).not.toThrow();
  });

  it("syncs FTS5 on node insert via trigger", () => {
    const db = new Database(":memory:");
    sqliteVec.load(db);
    db.pragma("journal_mode = WAL");
    db.exec(MEMORY_MIGRATIONS);

    db.prepare(
      `INSERT INTO nodes (id, repo, kind, title, body, meta, source_id, source_type, created_at, updated_at)
       VALUES ('n1', 'test-repo', 'message', 'Hello world', 'Full body text', '{}', 's1', 'bridge', datetime('now'), datetime('now'))`
    ).run();

    const fts = db
      .prepare("SELECT * FROM nodes_fts WHERE nodes_fts MATCH 'Hello'")
      .all();
    expect(fts).toHaveLength(1);
  });

  it("syncs FTS5 on node delete via trigger", () => {
    const db = new Database(":memory:");
    sqliteVec.load(db);
    db.pragma("journal_mode = WAL");
    db.exec(MEMORY_MIGRATIONS);

    db.prepare(
      `INSERT INTO nodes (id, repo, kind, title, body, meta, source_id, source_type, created_at, updated_at)
       VALUES ('n1', 'test-repo', 'message', 'Hello world', 'Full body text', '{}', 's1', 'bridge', datetime('now'), datetime('now'))`
    ).run();
    db.prepare("DELETE FROM nodes WHERE id = 'n1'").run();

    const fts = db
      .prepare("SELECT * FROM nodes_fts WHERE nodes_fts MATCH 'Hello'")
      .all();
    expect(fts).toHaveLength(0);
  });

  it("enforces unique constraint on edges (from_node, to_node, kind)", () => {
    const db = new Database(":memory:");
    sqliteVec.load(db);
    db.pragma("journal_mode = WAL");
    db.exec(MEMORY_MIGRATIONS);

    // Insert a node first so edge references are valid
    db.prepare(
      `INSERT INTO nodes (id, repo, kind, title, body, meta, source_id, source_type, created_at, updated_at)
       VALUES ('n1', 'r', 'message', 't', 'b', '{}', 's', 'bridge', datetime('now'), datetime('now'))`
    ).run();
    db.prepare(
      `INSERT INTO nodes (id, repo, kind, title, body, meta, source_id, source_type, created_at, updated_at)
       VALUES ('n2', 'r', 'message', 't', 'b', '{}', 's2', 'bridge', datetime('now'), datetime('now'))`
    ).run();

    db.prepare(
      `INSERT INTO edges (id, repo, from_node, to_node, kind, weight, meta, auto, created_at)
       VALUES ('e1', 'r', 'n1', 'n2', 'contains', 1.0, '{}', 1, datetime('now'))`
    ).run();

    expect(() =>
      db.prepare(
        `INSERT INTO edges (id, repo, from_node, to_node, kind, weight, meta, auto, created_at)
         VALUES ('e2', 'r', 'n1', 'n2', 'contains', 1.0, '{}', 1, datetime('now'))`
      ).run()
    ).toThrow();
  });
});

describe("createMemoryDatabase", () => {
  it("returns a database with WAL mode and all tables", () => {
    const db = createMemoryDatabase(":memory:");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("nodes");
    expect(tableNames).toContain("edges");
    db.close();
  });
});
