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

- **nodes** — `id` (UUID PK), `repo`, `kind`, `title`, `body`, `meta` (JSON), `source_id`, `source_type`, `created_at`, `updated_at`
  - NODE_KINDS: `message | conversation | topic | decision | artifact | task`
- **edges** — `id` (UUID PK), `repo`, `from_node` (FK→nodes), `to_node` (FK→nodes), `kind`, `weight` (REAL), `meta` (JSON), `auto` (0|1), `created_at`
  - EDGE_KINDS: `contains | spawned | assigned_in | reply_to | led_to | discussed_in | decided_in | implemented_by | references | related_to`
- **nodes_fts** — FTS5 external-content table indexing `title` + `body`. Kept in sync via triggers (`nodes_ai`, `nodes_ad`, `nodes_au`). Never write to this table directly.
- **node_embeddings** — sqlite-vec virtual table (`vec0`), columns `node_id` + `embedding float[768]`. Written via `mdb.upsertEmbedding(nodeId, vector)`.
- **ingestion_cursors** — `(id, repo)` composite PK, tracks position in external data sources for idempotent re-runs.

## MemoryDbClient Interface

Key methods:
- `insertNode(node)` → `MemoryNode`
- `getNode(id)` → `MemoryNode | undefined`
- `getNodeBySource(sourceType, sourceId)` → `MemoryNode | undefined` — use for idempotency checks
- `updateNode(id, patch)`
- `deleteNode(id)`
- `insertEdge(edge)` → `MemoryEdge`
- `getEdges(nodeId, direction)` → `MemoryEdge[]`
- `searchFTS(query, repo, limit)` → ranked `MemoryNode[]`
- `searchKNN(embedding, limit, repo)` → nearest `MemoryNode[]`
- `transaction<T>(fn: () => T): T`

## Idempotency Pattern

Before inserting a memory node from an external source, always check existence:

```typescript
const existing = mdb.getNodeBySource("bridge", message.id);
if (existing) return ok(existing); // already ingested
const node = mdb.insertNode({ sourceType: "bridge", sourceId: message.id, ... });
```

This prevents duplicate nodes when backfill and live ingestion overlap.
