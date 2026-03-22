// mcp-bridge/tests/traverse-memory.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { type MemoryDbClient } from "../src/db/memory-client.js";
import { traverseMemory } from "../src/application/services/traverse-memory.js";
import { createTestMemoryDb } from "./helpers.js";

let mdb: MemoryDbClient;

beforeEach(() => {
  ({ mdb } = createTestMemoryDb());
});

/** Helper to create a simple chain: A → B → C */
function createChain() {
  const a = mdb.insertNode({ repo: "r", kind: "conversation", title: "A", body: "Node A", meta: "{}", source_id: "a", source_type: "test" });
  const b = mdb.insertNode({ repo: "r", kind: "message", title: "B", body: "Node B", meta: "{}", source_id: "b", source_type: "test" });
  const c = mdb.insertNode({ repo: "r", kind: "message", title: "C", body: "Node C", meta: "{}", source_id: "c", source_type: "test" });
  mdb.insertEdge({ repo: "r", from_node: a.id, to_node: b.id, kind: "contains", weight: 1, meta: "{}", auto: true });
  mdb.insertEdge({ repo: "r", from_node: b.id, to_node: c.id, kind: "reply_to", weight: 1, meta: "{}", auto: true });
  return { a, b, c };
}

describe("traverseMemory", () => {
  it("returns root + connected nodes via BFS", () => {
    const { a } = createChain();
    const result = traverseMemory(mdb, { node_id: a.id, direction: "outgoing" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nodes).toHaveLength(3);
    expect(result.data.root).toBe(a.id);
  });

  it("respects max_depth", () => {
    const { a } = createChain();
    const result = traverseMemory(mdb, { node_id: a.id, direction: "outgoing", max_depth: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // depth 0 = A, depth 1 = B; C is at depth 2 (excluded)
    expect(result.data.nodes).toHaveLength(2);
  });

  it("respects direction filter — outgoing only", () => {
    const { c } = createChain();
    const result = traverseMemory(mdb, { node_id: c.id, direction: "outgoing" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // C has no outgoing edges
    expect(result.data.nodes).toHaveLength(1);
  });

  it("respects direction filter — incoming only", () => {
    const { c } = createChain();
    const result = traverseMemory(mdb, { node_id: c.id, direction: "incoming" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // C ← B ← A (incoming traversal)
    expect(result.data.nodes).toHaveLength(3);
  });

  it("caps at max_nodes", () => {
    // Create a wide graph: hub → 60 children
    const hub = mdb.insertNode({ repo: "r", kind: "conversation", title: "Hub", body: "Hub", meta: "{}", source_id: "hub", source_type: "test" });
    for (let i = 0; i < 60; i++) {
      const child = mdb.insertNode({ repo: "r", kind: "message", title: `Child ${i}`, body: `Body ${i}`, meta: "{}", source_id: `c${i}`, source_type: "test" });
      mdb.insertEdge({ repo: "r", from_node: hub.id, to_node: child.id, kind: "contains", weight: 1, meta: "{}", auto: true });
    }

    const result = traverseMemory(mdb, { node_id: hub.id, direction: "outgoing", max_nodes: 50 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nodes.length).toBeLessThanOrEqual(50);
  });

  it("returns edges in the subgraph", () => {
    const { a } = createChain();
    const result = traverseMemory(mdb, { node_id: a.id, direction: "outgoing" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.edges.length).toBe(2);
  });

  it("returns only root for isolated node", () => {
    const isolated = mdb.insertNode({ repo: "r", kind: "message", title: "Lonely", body: "No edges", meta: "{}", source_id: "lone", source_type: "test" });
    const result = traverseMemory(mdb, { node_id: isolated.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nodes).toHaveLength(1);
    expect(result.data.edges).toHaveLength(0);
  });

  it("filters by edge_kinds", () => {
    const { a } = createChain();
    const result = traverseMemory(mdb, { node_id: a.id, direction: "outgoing", edge_kinds: ["contains"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // A → B (contains), but B → C (reply_to) is filtered out
    expect(result.data.nodes).toHaveLength(2);
    expect(result.data.edges).toHaveLength(1);
  });

  it("returns BFS steps with parent linkage", () => {
    const n1 = mdb.insertNode({ repo: "r", kind: "message", title: "root", body: "", meta: "{}", source_id: "1", source_type: "t" });
    const n2 = mdb.insertNode({ repo: "r", kind: "message", title: "child", body: "", meta: "{}", source_id: "2", source_type: "t" });
    const edge = mdb.insertEdge({ repo: "r", from_node: n1.id, to_node: n2.id, kind: "contains", weight: 1.0, meta: "{}", auto: true });

    const result = traverseMemory(mdb, { node_id: n1.id, direction: "outgoing", max_depth: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.steps).toBeDefined();
    expect(result.data.steps).toHaveLength(2);
    expect(result.data.steps[0]).toEqual({ node_id: n1.id, parent_id: null, edge_id: null, edge_kind: null });
    expect(result.data.steps[1]).toEqual({ node_id: n2.id, parent_id: n1.id, edge_id: edge.id, edge_kind: "contains" });
  });

  it("filters BFS results by sender when provided", () => {
    const n1 = mdb.insertNode({ repo: "r", kind: "conversation", title: "conv", body: "", meta: "{}", source_id: "1", source_type: "t" });
    const n2 = mdb.insertNode({ repo: "r", kind: "message", title: "human msg", body: "", meta: "{}", source_id: "2", source_type: "t", sender: "human" });
    const n3 = mdb.insertNode({ repo: "r", kind: "message", title: "assistant msg", body: "", meta: "{}", source_id: "3", source_type: "t", sender: "assistant" });
    mdb.insertEdge({ repo: "r", from_node: n1.id, to_node: n2.id, kind: "contains", weight: 1.0, meta: "{}", auto: true });
    mdb.insertEdge({ repo: "r", from_node: n1.id, to_node: n3.id, kind: "contains", weight: 1.0, meta: "{}", auto: true });

    const result = traverseMemory(mdb, { node_id: n1.id, direction: "outgoing", max_depth: 2, sender: "human" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should include root (no sender filter on root) + human node, skip assistant node
    const nodeIds = result.data.nodes.map(n => n.id);
    expect(nodeIds).toContain(n1.id);
    expect(nodeIds).toContain(n2.id);
    expect(nodeIds).not.toContain(n3.id);
  });
});
