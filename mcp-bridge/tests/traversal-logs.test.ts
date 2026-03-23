import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { MEMORY_MIGRATIONS } from "../src/db/memory-schema.js";
import { createMemoryDbClient, type MemoryDbClient } from "../src/db/memory-client.js";

describe("traversal_logs", () => {
  let mdb: MemoryDbClient;

  beforeEach(() => {
    const raw = new Database(":memory:");
    sqliteVec.load(raw);
    raw.pragma("journal_mode = WAL");
    raw.exec(MEMORY_MIGRATIONS);
    mdb = createMemoryDbClient(raw);
  });

  it("inserts and retrieves a traversal log", () => {
    const node = mdb.insertNode({
      repo: "r", kind: "message", title: "start", body: "", meta: "{}", source_id: "n1", source_type: "t",
    });

    const log = mdb.insertTraversalLog({
      repo: "r",
      agent: "claude-code",
      operation: "traverse",
      start_node: node.id,
      params: { direction: "both", max_depth: 3 },
      steps: [{ node_id: node.id, parent_id: null, edge_id: null, edge_kind: null }],
    });

    expect(log.id).toBeDefined();
    expect(log.agent).toBe("claude-code");
    expect(log.operation).toBe("traverse");

    const fetched = mdb.getTraversalLog(log.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.steps).toHaveLength(1);
    expect(fetched!.params.direction).toBe("both");
  });

  it("lists traversal logs ordered by created_at desc", () => {
    mdb.insertTraversalLog({ repo: "r", agent: "a", operation: "traverse", start_node: null, params: {}, steps: [] });
    mdb.insertTraversalLog({ repo: "r", agent: "b", operation: "context", start_node: null, params: {}, steps: [] });
    mdb.insertTraversalLog({ repo: "other", agent: "c", operation: "traverse", start_node: null, params: {}, steps: [] });

    const logs = mdb.getTraversalLogs("r", 10);
    expect(logs).toHaveLength(2);
    expect(logs[0].agent).toBe("b"); // most recent first
  });

  it("respects limit parameter", () => {
    for (let i = 0; i < 5; i++) {
      mdb.insertTraversalLog({ repo: "r", agent: `a${i}`, operation: "traverse", start_node: null, params: {}, steps: [] });
    }
    const logs = mdb.getTraversalLogs("r", 2);
    expect(logs).toHaveLength(2);
  });

  it("stores scores and token_allocation for context operations", () => {
    const log = mdb.insertTraversalLog({
      repo: "r",
      agent: "ui-user",
      operation: "context",
      start_node: null,
      params: { query: "test", token_budget: 8000 },
      steps: [{ node_id: "n1", parent_id: null, edge_id: null, edge_kind: null }],
      scores: { n1: 0.95 },
      token_allocation: { "Summary": 200, "Details": 500 },
    });

    const fetched = mdb.getTraversalLog(log.id);
    expect(fetched!.scores).toEqual({ n1: 0.95 });
    expect(fetched!.token_allocation).toEqual({ Summary: 200, Details: 500 });
  });

  it("handles ON DELETE SET NULL for start_node", () => {
    const node = mdb.insertNode({
      repo: "r", kind: "message", title: "t", body: "", meta: "{}", source_id: "n1", source_type: "t",
    });
    const log = mdb.insertTraversalLog({
      repo: "r", agent: "a", operation: "traverse", start_node: node.id, params: {}, steps: [],
    });

    // Delete the node — log should survive with null start_node
    mdb.deleteNodesBySourceType("t", "r");

    const fetched = mdb.getTraversalLog(log.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.start_node).toBeNull();
  });
});
