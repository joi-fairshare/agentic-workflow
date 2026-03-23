// mcp-bridge/src/application/services/traverse-memory.ts
import type { MemoryDbClient, NodeRow, EdgeRow } from "../../db/memory-client.js";
import type { AppResult } from "../result.js";
import { ok, err } from "../result.js";

// ── Types ────────────────────────────────────────────────────

export interface BFSStep {
  node_id: string;
  parent_id: string | null;
  edge_id: string | null;
  edge_kind: string | null;
}

export interface TraverseInput {
  node_id: string;
  direction?: "outgoing" | "incoming" | "both";
  edge_kinds?: string[];
  max_depth?: number;
  max_nodes?: number;
  sender?: string;
}

export interface TraverseResult {
  nodes: NodeRow[];
  edges: EdgeRow[];
  root: string;
  steps: BFSStep[];
}

// ── Service ──────────────────────────────────────────────────

export function traverseMemory(
  mdb: MemoryDbClient,
  input: TraverseInput,
): AppResult<TraverseResult> {
  const {
    node_id,
    direction = "both",
    edge_kinds,
    max_depth = 3,
    max_nodes = 50,
    sender,
  } = input;

  const root = mdb.getNode(node_id);
  if (!root) return err({ code: "NOT_FOUND", message: `Node ${node_id} not found`, statusHint: 404 });

  const kindSet = edge_kinds ? new Set(edge_kinds) : null;
  const visited = new Set<string>([node_id]);
  const collectedNodes: NodeRow[] = [root];
  const collectedEdges: EdgeRow[] = [];
  const steps: BFSStep[] = [{ node_id, parent_id: null, edge_id: null, edge_kind: null }];

  // BFS queue: [nodeId, depth].
  // Array.shift() is O(n) per dequeue; at the current max_nodes=50 bound the
  // queue never exceeds 50 entries so this is negligible in practice.
  const queue: Array<[string, number]> = [[node_id, 0]];

  while (queue.length > 0 && collectedNodes.length < max_nodes) {
    const [currentId, depth] = queue.shift()!;
    if (depth >= max_depth) continue;

    const neighbors: EdgeRow[] = [];

    if (direction === "outgoing" || direction === "both") {
      neighbors.push(...mdb.getEdgesFrom(currentId));
    }
    if (direction === "incoming" || direction === "both") {
      neighbors.push(...mdb.getEdgesTo(currentId));
    }

    for (const edge of neighbors) {
      // Filter by edge kind
      if (kindSet && !kindSet.has(edge.kind)) continue;

      // Determine the neighbor node id
      const neighborId = edge.from_node === currentId ? edge.to_node : edge.from_node;

      if (visited.has(neighborId)) continue;

      // N+1 tradeoff: one getNode per neighbor is acceptable at current bounds
      // (max_nodes=50). If max_nodes grows significantly, batch-load with a
      // single WHERE id IN (...) query instead.
      const neighborNode = mdb.getNode(neighborId);
      /* v8 ignore next */
      if (!neighborNode) continue;

      // Apply sender filter: skip non-root nodes whose sender doesn't match.
      // Nodes with sender=null (structural nodes like conversations) are always included.
      if (sender !== undefined && neighborNode.sender !== null && neighborNode.sender !== sender) {
        visited.add(neighborId);
        continue;
      }

      visited.add(neighborId);
      collectedNodes.push(neighborNode);
      collectedEdges.push(edge);
      steps.push({ node_id: neighborId, parent_id: currentId, edge_id: edge.id, edge_kind: edge.kind });

      if (collectedNodes.length >= max_nodes) break;

      queue.push([neighborId, depth + 1]);
    }
  }

  return ok({
    nodes: collectedNodes,
    edges: collectedEdges,
    root: node_id,
    steps,
  });
}
