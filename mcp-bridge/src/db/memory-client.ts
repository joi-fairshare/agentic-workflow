// mcp-bridge/src/db/memory-client.ts
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { NodeKind, EdgeKind } from "./memory-schema.js";
import { MAX_BODY_BYTES } from "./memory-schema.js";

// ── Row types ──────────────────────────────────────────────

export interface NodeRow {
  id: string;
  repo: string;
  kind: NodeKind;
  title: string;
  body: string;
  meta: string;
  source_id: string;
  source_type: string;
  sender: string | null;
  created_at: string;
  updated_at: string;
}

export interface EdgeRow {
  id: string;
  repo: string;
  from_node: string;
  to_node: string;
  kind: EdgeKind;
  weight: number;
  meta: string;
  auto: number;
  created_at: string;
}

export interface FTSResult extends NodeRow {
  rank: number;
}

export interface MemoryStats {
  node_count: number;
  edge_count: number;
}

// ── Input types ────────────────────────────────────────────

export interface InsertNodeInput {
  repo: string;
  kind: NodeKind;
  title: string;
  body: string;
  meta: string;
  source_id: string;
  source_type: string;
  sender?: string | null;
}

export interface InsertEdgeInput {
  repo: string;
  from_node: string;
  to_node: string;
  kind: EdgeKind;
  weight: number;
  meta: string;
  auto: boolean;
}

export interface TraversalLogRow {
  id: string;
  repo: string;
  agent: string;
  operation: "traverse" | "context";
  start_node: string | null;
  params: Record<string, unknown>;
  steps: Array<{ node_id: string; parent_id: string | null; edge_id: string | null; edge_kind: string | null }>;
  scores?: Record<string, number>;
  token_allocation?: Record<string, number>;
  created_at: string;
}

export interface InsertTraversalLogInput {
  repo: string;
  agent: string;
  operation: "traverse" | "context";
  start_node: string | null;
  params: Record<string, unknown>;
  steps: Array<{ node_id: string; parent_id: string | null; edge_id: string | null; edge_kind: string | null }>;
  scores?: Record<string, number>;
  token_allocation?: Record<string, number>;
}

// ── MemoryDbClient interface ───────────────────────────────

export interface MemoryDbClient {
  // Nodes
  insertNode(input: InsertNodeInput): NodeRow;
  getNode(id: string): NodeRow | undefined;
  getNodeBySource(source_type: string, source_id: string): NodeRow | undefined;
  getNodesByRepo(repo: string, limit: number, offset: number): NodeRow[];
  getNodesByRepoAndKind(repo: string, kind: NodeKind): NodeRow[];
  /** Delete all nodes with the given source_type and repo. Cascades to edges and embeddings via ON DELETE CASCADE. */
  deleteNodesBySourceType(source_type: string, repo: string): void;
  /** Update the meta JSON of an existing node. */
  updateNodeMeta(id: string, meta: string): void;

  // Edges
  insertEdge(input: InsertEdgeInput): EdgeRow;
  getEdgesFrom(nodeId: string): EdgeRow[];
  getEdgesTo(nodeId: string): EdgeRow[];

  // Cursors
  upsertCursor(id: string, repo: string, cursor: string): void;
  getCursor(id: string, repo: string): string | undefined;

  // Search
  searchFTS(query: string, repo: string, limit: number, sender?: string): FTSResult[];
  getDistinctSenders(repo: string): string[];

  // Embeddings
  insertEmbedding(nodeId: string, embedding: Float32Array): void;
  getEmbedding(nodeId: string): Float32Array | undefined;
  searchKNN(query: Float32Array, limit: number, repo?: string, sender?: string): Array<{ node_id: string; distance: number }>;

  // Conversations
  getConversationNodes(repo: string, limit: number, offset: number): NodeRow[];
  countConversationNodes(repo: string): number;

  // Stats
  getStats(repo: string): MemoryStats;
  getDistinctRepos(): string[];

  // Traversal logs
  insertTraversalLog(input: InsertTraversalLogInput): TraversalLogRow;
  getTraversalLog(id: string): TraversalLogRow | null;
  getTraversalLogs(repo: string, limit: number): TraversalLogRow[];
  pruneTraversalLogs(days: number): number;

  // Transaction
  transaction<T>(fn: () => T): T;

}

// ── Factory ────────────────────────────────────────────────
//
// Note on `as` casts: better-sqlite3 returns `unknown` from .get()/.all() by design —
// the library has no generic overloads. Casting to the expected row type at the call
// site is the idiomatic pattern for this library (a typed queryRow<T> wrapper would
// just move the cast, not eliminate it).

export function createMemoryDbClient(db: Database.Database): MemoryDbClient {
  const stmts = {
    insertNode: db.prepare(`
      INSERT INTO nodes (id, repo, kind, title, body, meta, source_id, source_type, sender, created_at, updated_at)
      VALUES (@id, @repo, @kind, @title, @body, @meta, @source_id, @source_type, @sender, @created_at, @updated_at)
    `),

    getNode: db.prepare("SELECT * FROM nodes WHERE id = @id"),

    getNodeBySource: db.prepare(
      "SELECT * FROM nodes WHERE source_type = @source_type AND source_id = @source_id"
    ),

    getNodesByRepo: db.prepare(
      "SELECT * FROM nodes WHERE repo = @repo ORDER BY created_at DESC LIMIT @limit OFFSET @offset"
    ),

    getNodesByRepoAndKind: db.prepare(
      "SELECT * FROM nodes WHERE repo = @repo AND kind = @kind ORDER BY created_at DESC"
    ),

    deleteNodesBySourceType: db.prepare(
      "DELETE FROM nodes WHERE source_type = @source_type AND repo = @repo"
    ),

    updateNodeMeta: db.prepare(
      "UPDATE nodes SET meta = @meta, updated_at = datetime('now') WHERE id = @id"
    ),

    insertEdge: db.prepare(`
      INSERT INTO edges (id, repo, from_node, to_node, kind, weight, meta, auto, created_at)
      VALUES (@id, @repo, @from_node, @to_node, @kind, @weight, @meta, @auto, @created_at)
    `),

    getEdgesFrom: db.prepare("SELECT * FROM edges WHERE from_node = @nodeId"),

    getEdgesTo: db.prepare("SELECT * FROM edges WHERE to_node = @nodeId"),

    upsertCursor: db.prepare(`
      INSERT INTO ingestion_cursors (id, repo, cursor, updated_at)
      VALUES (@id, @repo, @cursor, @updated_at)
      ON CONFLICT(id, repo) DO UPDATE SET cursor = @cursor, updated_at = @updated_at
    `),

    getCursor: db.prepare(
      "SELECT cursor FROM ingestion_cursors WHERE id = @id AND repo = @repo"
    ),

    searchFTS: db.prepare(`
      SELECT nodes.*, rank
      FROM nodes_fts
      JOIN nodes ON nodes.rowid = nodes_fts.rowid
      WHERE nodes_fts MATCH @query AND nodes.repo = @repo
      ORDER BY rank
      LIMIT @limit
    `),

    searchFTSBySender: db.prepare(`
      SELECT nodes.*, rank
      FROM nodes_fts
      JOIN nodes ON nodes.rowid = nodes_fts.rowid
      WHERE nodes_fts MATCH @query AND nodes.repo = @repo AND nodes.sender = @sender
      ORDER BY rank
      LIMIT @limit
    `),

    searchFTSAllRepos: db.prepare(`
      SELECT nodes.*, rank
      FROM nodes_fts
      JOIN nodes ON nodes.rowid = nodes_fts.rowid
      WHERE nodes_fts MATCH @query
      ORDER BY rank
      LIMIT @limit
    `),

    searchFTSAllReposBySender: db.prepare(`
      SELECT nodes.*, rank
      FROM nodes_fts
      JOIN nodes ON nodes.rowid = nodes_fts.rowid
      WHERE nodes_fts MATCH @query AND nodes.sender = @sender
      ORDER BY rank
      LIMIT @limit
    `),

    getDistinctSenders: db.prepare(`
      SELECT DISTINCT sender FROM nodes
      WHERE repo = @repo AND sender IS NOT NULL
      ORDER BY sender ASC
    `),

    getConversationNodes: db.prepare(
      "SELECT * FROM nodes WHERE repo = @repo AND kind = 'conversation' ORDER BY created_at DESC LIMIT @limit OFFSET @offset"
    ),

    countConversationNodes: db.prepare(
      "SELECT COUNT(*) as count FROM nodes WHERE repo = @repo AND kind = 'conversation'"
    ),

    getDistinctRepos: db.prepare(
      "SELECT DISTINCT repo FROM nodes ORDER BY repo ASC"
    ),

    nodeCount: db.prepare("SELECT COUNT(*) as count FROM nodes WHERE repo = @repo"),
    edgeCount: db.prepare("SELECT COUNT(*) as count FROM edges WHERE repo = @repo"),

    insertEmbedding: db.prepare(
      "INSERT INTO node_embeddings (node_id, embedding) VALUES (?, ?)"
    ),
    getEmbedding: db.prepare(
      "SELECT embedding FROM node_embeddings WHERE node_id = ?"
    ),
    searchKNN: db.prepare(`
      SELECT node_id, distance
      FROM node_embeddings
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `),

    insertTraversalLog: db.prepare(`
      INSERT INTO traversal_logs (id, repo, agent, operation, start_node, params, steps, scores, token_allocation, created_at)
      VALUES (@id, @repo, @agent, @operation, @start_node, @params, @steps, @scores, @token_allocation, @created_at)
    `),

    getTraversalLog: db.prepare(
      "SELECT * FROM traversal_logs WHERE id = @id"
    ),

    getTraversalLogs: db.prepare(
      "SELECT * FROM traversal_logs WHERE repo = @repo ORDER BY created_at DESC, rowid DESC LIMIT @limit"
    ),

    pruneTraversalLogs: db.prepare(
      "DELETE FROM traversal_logs WHERE created_at < datetime('now', '-' || @days || ' days')"
    ),
  };

  // Hoist encoder/decoder to closure scope so they're created once, not per call.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  /** Truncate body to MAX_BODY_BYTES (P1 fix). */
  function truncateBody(body: string): string {
    const bytes = encoder.encode(body);
    if (bytes.length <= MAX_BODY_BYTES) return body;
    let decoded = decoder.decode(bytes.slice(0, MAX_BODY_BYTES));
    // Strip trailing UTF-8 replacement character that can appear at a multi-byte boundary.
    if (decoded.endsWith("\uFFFD")) {
      decoded = decoded.slice(0, -1);
    }
    return decoded;
  }

  return {
    insertNode(input) {
      const now = new Date().toISOString();
      const row: NodeRow = {
        ...input,
        sender: input.sender ?? null,
        body: truncateBody(input.body),
        id: randomUUID(),
        created_at: now,
        updated_at: now,
      };
      stmts.insertNode.run(row);
      return row;
    },

    getNode(id) {
      return stmts.getNode.get({ id }) as NodeRow | undefined;
    },

    getNodeBySource(source_type, source_id) {
      return stmts.getNodeBySource.get({ source_type, source_id }) as NodeRow | undefined;
    },

    getNodesByRepo(repo, limit, offset) {
      return stmts.getNodesByRepo.all({ repo, limit, offset }) as NodeRow[];
    },

    getNodesByRepoAndKind(repo, kind) {
      return stmts.getNodesByRepoAndKind.all({ repo, kind }) as NodeRow[];
    },

    deleteNodesBySourceType(source_type, repo) {
      stmts.deleteNodesBySourceType.run({ source_type, repo });
    },

    updateNodeMeta(id, meta) {
      stmts.updateNodeMeta.run({ id, meta });
    },

    insertEdge(input) {
      const row: EdgeRow = {
        id: randomUUID(),
        repo: input.repo,
        from_node: input.from_node,
        to_node: input.to_node,
        kind: input.kind,
        weight: input.weight,
        meta: input.meta,
        auto: input.auto ? 1 : 0,
        created_at: new Date().toISOString(),
      };
      stmts.insertEdge.run(row);
      return row;
    },

    getEdgesFrom(nodeId) {
      return stmts.getEdgesFrom.all({ nodeId }) as EdgeRow[];
    },

    getEdgesTo(nodeId) {
      return stmts.getEdgesTo.all({ nodeId }) as EdgeRow[];
    },

    upsertCursor(id, repo, cursor) {
      stmts.upsertCursor.run({ id, repo, cursor, updated_at: new Date().toISOString() });
    },

    getCursor(id, repo) {
      const row = stmts.getCursor.get({ id, repo }) as { cursor: string } | undefined;
      return row?.cursor;
    },

    searchFTS(query, repo, limit, sender?) {
      // Sanitize FTS5 query: quote each word to prevent parse errors from special chars
      const sanitized = query
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => `"${word.replace(/"/g, '""')}"`)
        .join(" ");
      if (!sanitized) return [];
      try {
        if (!repo) {
          // Empty repo → search across all repos
          if (sender !== undefined) {
            return stmts.searchFTSAllReposBySender.all({ query: sanitized, limit, sender }) as FTSResult[];
          }
          return stmts.searchFTSAllRepos.all({ query: sanitized, limit }) as FTSResult[];
        }
        if (sender !== undefined) {
          return stmts.searchFTSBySender.all({ query: sanitized, repo, limit, sender }) as FTSResult[];
        }
        return stmts.searchFTS.all({ query: sanitized, repo, limit }) as FTSResult[];
      /* v8 ignore next 4 */
      } catch {
        // FTS5 parse errors (e.g. malformed MATCH syntax) → empty result
        return [];
      }
    },

    getDistinctSenders(repo) {
      const rows = stmts.getDistinctSenders.all({ repo }) as Array<{ sender: string }>;
      return rows.map((r) => r.sender);
    },

    getConversationNodes(repo, limit, offset) {
      return stmts.getConversationNodes.all({ repo, limit, offset }) as NodeRow[];
    },

    countConversationNodes(repo) {
      const row = stmts.countConversationNodes.get({ repo }) as { count: number };
      return row.count;
    },

    getDistinctRepos() {
      const rows = stmts.getDistinctRepos.all() as Array<{ repo: string }>;
      return rows.map((r) => r.repo);
    },

    getStats(repo) {
      const nc = stmts.nodeCount.get({ repo }) as { count: number };
      const ec = stmts.edgeCount.get({ repo }) as { count: number };
      return { node_count: nc.count, edge_count: ec.count };
    },

    insertEmbedding(nodeId, embedding) {
      // Use byteOffset + byteLength to handle Float32Array views into a larger SharedArrayBuffer.
      stmts.insertEmbedding.run(nodeId, Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength));
    },

    getEmbedding(nodeId) {
      const row = stmts.getEmbedding.get(nodeId) as { embedding: Buffer } | undefined;
      if (!row) return undefined;
      return new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
    },

    searchKNN(query, limit, repo?, sender?) {
      // Use byteOffset + byteLength to handle Float32Array views into a larger SharedArrayBuffer.
      const queryBuf = Buffer.from(query.buffer, query.byteOffset, query.byteLength);
      if (!repo && !sender) {
        return stmts.searchKNN.all(queryBuf, limit) as Array<{ node_id: string; distance: number }>;
      }
      // Fetch extra candidates (limit * 3) then post-filter by repo/sender via nodes table lookup.
      // sqlite-vec KNN queries don't support JOIN, so we over-fetch and filter in JS.
      const overFetchLimit = limit * 3;
      const candidates = stmts.searchKNN.all(queryBuf, overFetchLimit) as Array<{ node_id: string; distance: number }>;
      const filtered: Array<{ node_id: string; distance: number }> = [];
      for (const candidate of candidates) {
        /* v8 ignore next */
        if (filtered.length >= limit) break;
        const node = stmts.getNode.get({ id: candidate.node_id }) as NodeRow | undefined;
        if (!node) continue;
        if (repo && node.repo !== repo) continue;
        if (sender && node.sender !== sender) continue;
        filtered.push(candidate);
      }
      return filtered;
    },

    insertTraversalLog(input) {
      const now = new Date().toISOString();
      const id = randomUUID();
      const row = {
        id,
        repo: input.repo,
        agent: input.agent,
        operation: input.operation,
        start_node: input.start_node ?? null,
        params: JSON.stringify(input.params),
        steps: JSON.stringify(input.steps),
        scores: input.scores !== undefined ? JSON.stringify(input.scores) : null,
        token_allocation: input.token_allocation !== undefined ? JSON.stringify(input.token_allocation) : null,
        created_at: now,
      };
      stmts.insertTraversalLog.run(row);
      return {
        id,
        repo: input.repo,
        agent: input.agent,
        operation: input.operation,
        start_node: input.start_node ?? null,
        params: input.params,
        steps: input.steps,
        scores: input.scores,
        token_allocation: input.token_allocation,
        created_at: now,
      };
    },

    getTraversalLog(id) {
      const raw = stmts.getTraversalLog.get({ id }) as {
        id: string; repo: string; agent: string; operation: "traverse" | "context";
        start_node: string | null; params: string; steps: string;
        scores: string | null; token_allocation: string | null; created_at: string;
      } | undefined;
      if (!raw) return null;
      return {
        id: raw.id,
        repo: raw.repo,
        agent: raw.agent,
        operation: raw.operation,
        start_node: raw.start_node,
        params: JSON.parse(raw.params) as Record<string, unknown>,
        steps: JSON.parse(raw.steps) as TraversalLogRow["steps"],
        scores: raw.scores !== null ? JSON.parse(raw.scores) as Record<string, number> : undefined,
        token_allocation: raw.token_allocation !== null ? JSON.parse(raw.token_allocation) as Record<string, number> : undefined,
        created_at: raw.created_at,
      };
    },

    getTraversalLogs(repo, limit) {
      const rows = stmts.getTraversalLogs.all({ repo, limit }) as Array<{
        id: string; repo: string; agent: string; operation: "traverse" | "context";
        start_node: string | null; params: string; steps: string;
        scores: string | null; token_allocation: string | null; created_at: string;
      }>;
      return rows.map((raw) => ({
        id: raw.id,
        repo: raw.repo,
        agent: raw.agent,
        operation: raw.operation,
        start_node: raw.start_node,
        params: JSON.parse(raw.params) as Record<string, unknown>,
        steps: JSON.parse(raw.steps) as TraversalLogRow["steps"],
        scores: raw.scores !== null ? JSON.parse(raw.scores) as Record<string, number> : undefined,
        token_allocation: raw.token_allocation !== null ? JSON.parse(raw.token_allocation) as Record<string, number> : undefined,
        created_at: raw.created_at,
      }));
    },

    pruneTraversalLogs(days) {
      const result = stmts.pruneTraversalLogs.run({ days });
      return result.changes;
    },

    transaction<T>(fn: () => T): T {
      return db.transaction(fn)();
    },
  };
}
