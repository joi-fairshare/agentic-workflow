---
globs: ["mcp-bridge/src/db/**"]
---

# Database Rules

## Two Databases, Two Clients

This project uses two separate SQLite databases:

| Database | File | Client | Purpose |
|----------|------|--------|---------|
| Bridge DB | `bridge.db` | `DbClient` | Messages, tasks, conversations |
| Memory DB | `memory.db` | `MemoryDbClient` | Knowledge graph: nodes, edges, embeddings |

Both use WAL mode (`journal_mode = WAL`), `foreign_keys = ON`, and `busy_timeout = 5000`.

## Prepared Statements Only

Never interpolate SQL strings. All queries use named parameters:

```typescript
// Correct
const stmt = db.prepare("SELECT * FROM messages WHERE id = @id");
stmt.get({ id });

// Wrong — SQL injection risk
db.prepare(`SELECT * FROM messages WHERE id = '${id}'`);
```

All prepared statements are created once at client construction time and reused for every call. This is both a security requirement and a performance optimization.

## DbClient Interface (bridge DB)

Key methods:
- `insertMessage(msg)` → `MessageRow`
- `getMessage(id)` → `MessageRow | undefined`
- `getMessagesByConversation(conversation, limit, offset)` → `MessageRow[]`
- `getUnreadMessages(recipient, limit)` → `MessageRow[]`
- `markRead(id)` / `markAllRead(conversation, recipient)`
- `insertTask(task)` → `TaskRow`
- `getTask(id)` → `TaskRow | undefined`
- `updateTaskStatus(id, status)`
- `getConversations(limit, offset)` → `ConversationSummary[]`
- `transaction<T>(fn: () => T): T` — wraps multiple operations atomically

## Transactions

Use transactions for any multi-step write sequence. The `transaction()` method is synchronous (better-sqlite3):

```typescript
const result = db.transaction(() => {
  const msg = db.insertMessage(msgInput);
  db.updateTaskStatus(taskId, "in_progress");
  return { message: msg, taskUpdated: true };
});
```

If any statement inside throws, the entire transaction is rolled back automatically.

## Bridge Schema (schema.ts)

Tables:
- **messages** — `id` (UUID), `conversation`, `sender`, `recipient`, `kind`, `payload`, `meta_prompt`, `created_at`, `read_at`
  - `kind` CHECK: `'context' | 'task' | 'status' | 'reply'`
- **tasks** — `id` (UUID), `conversation`, `domain`, `summary`, `details`, `analysis`, `assigned_to`, `status`, `created_at`, `updated_at`
  - `status` CHECK: `'pending' | 'in_progress' | 'completed' | 'failed'`

All IDs are UUID strings. Timestamps are ISO 8601 strings.

## Memory Schema (memory-schema.ts)

Separate DDL applied via `createMemoryDatabase()`. Key tables:

- **nodes** — `id` (UUID PK), `repo`, `kind`, `title`, `body`, `meta` (JSON), `source_id`, `source_type`, `sender` (TEXT, nullable), `created_at`, `updated_at`
  - NODE_KINDS: `message | conversation | topic | decision | artifact | task`
  - `sender` identifies the originating agent (e.g., `"claude-code"`, `"user"`, `"agent-a"`). Null for auto-created nodes. Indexed via `idx_nodes_repo_sender`.
- **edges** — `id` (UUID PK), `repo`, `from_node` (FK→nodes), `to_node` (FK→nodes), `kind`, `weight` (REAL), `meta` (JSON), `auto` (0|1), `created_at`
  - EDGE_KINDS: `contains | spawned | assigned_in | reply_to | led_to | discussed_in | decided_in | implemented_by | references | related_to`
- **nodes_fts** — FTS5 external-content table indexing `title` + `body`. Kept in sync via triggers (`nodes_ai`, `nodes_ad`, `nodes_au`). Never write to this table directly.
- **node_embeddings** — sqlite-vec virtual table (`vec0`), columns `node_id` + `embedding float[768]`. Written via `mdb.insertEmbedding(nodeId, embedding)`.
- **ingestion_cursors** — `(id, repo)` composite PK, tracks position in external data sources for idempotent re-runs.
- **traversal_logs** — `id` (UUID PK), `repo`, `agent` (nullable), `operation` (TEXT), `start_node`, `params` (JSON), `steps` (JSON), `scores` (JSON), `token_allocation` (INT), `created_at`. Indexed by `(repo, created_at DESC)`. Auto-pruned after N days via `pruneTraversalLogs`.

## MemoryDbClient Interface

Return types use `NodeRow`, `EdgeRow`, and `FTSResult` (exported from `memory-client.ts`). The types `MemoryNode` and `MemoryEdge` do not exist — do not import them.

Key methods:
- `insertNode(input)` → `NodeRow`
- `getNode(id)` → `NodeRow | undefined`
- `getNodeBySource(source_type, source_id)` → `NodeRow | undefined` — use for idempotency checks
- `getNodesByRepo(repo, limit, offset)` → `NodeRow[]`
- `getNodesByRepoAndKind(repo, kind)` → `NodeRow[]`
- `getConversationNodes(repo, limit, offset)` → `NodeRow[]` — nodes of kind `conversation`
- `countConversationNodes(repo)` → `number`
- `deleteNodesBySourceType(source_type, repo): void` — cascades to edges and embeddings via `ON DELETE CASCADE`
- `updateNodeMeta(id, meta: string): void` — overwrites the `meta` JSON column for a node
- `insertEdge(input)` → `EdgeRow`
- `getEdgesFrom(nodeId)` → `EdgeRow[]` — outgoing edges where `from_node = nodeId`
- `getEdgesTo(nodeId)` → `EdgeRow[]` — incoming edges where `to_node = nodeId`
- `upsertCursor(id, repo, cursor): void` / `getCursor(id, repo): string | undefined` — ingestion position tracking
- `searchFTS(query, repo, limit, sender?)` → `FTSResult[]` — `FTSResult` extends `NodeRow` with `rank: number`. Pass `sender` to filter by originating agent.
- `searchKNN(query: Float32Array, limit: number, repo?: string, sender?: string)` → `Array<{ node_id: string; distance: number }>` — caller must do a separate `getNode()` lookup for full row data
- `getDistinctSenders(repo)` → `string[]` — distinct non-null sender values for the repo
- `getDistinctRepos()` → `string[]` — all repos that have at least one node
- `insertEmbedding(nodeId, embedding: Float32Array): void` / `getEmbedding(nodeId): Float32Array | undefined`
- `getStats(repo)` → `MemoryStats` — `{ node_count: number; edge_count: number }`
- `insertTraversalLog(input: InsertTraversalLogInput)` → `TraversalLogRow`
- `getTraversalLog(id: string)` → `TraversalLogRow | null`
- `getTraversalLogs(repo: string, limit: number)` → `TraversalLogRow[]` — ordered by `created_at DESC`
- `pruneTraversalLogs(days: number)` → `number` (rows deleted) — removes logs older than N days
- `transaction<T>(fn: () => T): T`

## Idempotency Pattern

Before inserting a memory node from an external source, always check existence:

```typescript
const existing = mdb.getNodeBySource("bridge", message.id);
if (existing) return ok(existing); // already ingested
const node = mdb.insertNode({ sourceType: "bridge", sourceId: message.id, ... });
```

This prevents duplicate nodes when backfill and live ingestion overlap.
