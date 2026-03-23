---
globs: ["mcp-bridge/src/application/**", "mcp-bridge/src/routes/**", "mcp-bridge/src/server.ts", "mcp-bridge/src/mcp.ts", "mcp-bridge/src/index.ts"]
---

# Bridge Services Rules

## AppResult<T> — Services Never Throw

Every service function returns `AppResult<T>`. Never throw in business logic. The discriminated union propagates errors to callers without exceptions.

```typescript
import { ok, err, type AppResult } from "../result.js";

function myService(db: DbClient, input: ValidatedInput): AppResult<OutputRow> {
  const row = db.getRow(input.id);
  if (!row) return err({ code: "NOT_FOUND", message: "Row not found", statusHint: 404 });
  if (!isValid(row)) return err({ code: "VALIDATION_ERROR", message: "Invalid state", statusHint: 400 });
  return ok(row);
}
```

Standard error codes: `NOT_FOUND` (404), `VALIDATION_ERROR` (400), `INTERNAL_ERROR` (500), `CONFLICT` (409). Always include `statusHint` so controllers can map to HTTP status automatically.

## Service Function Contracts

- Services take `DbClient` or `MemoryDbClient` as the first argument — never import a singleton
- Services take typed, Zod-validated inputs (not raw request bodies)
- Services are pure functions — no side effects beyond the provided DB client
- Services live in `mcp-bridge/src/application/services/`
- No service imports from transport layer (no Zod, no Fastify types)

## EventBus Pattern

The EventBus is created once in `index.ts` and injected into controller factories. Never create a new bus inside a service.

```typescript
import { createEventBus } from "../events.js";

const bus = createEventBus();

// Subscribe (returns unsubscribe function)
// Handler receives the full BridgeEvent — check event.type to filter
const unsub = bus.subscribe((event) => {
  if (event.type === "message:created") {
    sseClients.forEach(c => c.send(JSON.stringify(event)));
  }
});

// Emit after successful DB write
bus.emit({ type: "message:created", data: messageRow });
```

Event types: `message:created`, `task:created`, `task:updated`, `memory:ingestion_dropped`, `memory:session_ingested`.

Emit events **after** the DB write succeeds. Controllers emit — services do not.

## Ingestion Queue Integration (index.ts)

The `AsyncQueue` decouples the EventBus from async memory processing. Pattern in `index.ts`:

1. Subscribe `bus.subscribe(event => { if (event.type === "message:created") ... })` → enqueue `{ id, conversation }`
2. Queue handler fetches full message row, calls `ingestBridgeMessage(memoryDb, secretFilter, repo, msg)`
3. `backfillBridge()` runs at startup (non-blocking) before subscribing to avoid missing messages
4. `SessionQueue` handles Claude Code session ingestion separately (rate-limited, one session per tick)

## MCP Tool Pattern (mcp.ts)

All 11 MCP tools follow this structure:

```typescript
server.tool("tool_name", "description", ZodSchema.shape, async (args) => {
  const parsed = ZodSchema.parse(args);
  const result = await myService(db, parsed);
  return resultToContent(result);
  // ok path → JSON string; error path → "Error [CODE]: message"
});
```

- Tools define Zod schemas for all parameters (no coercion in tool body)
- Tools never throw — services return AppResult, `resultToContent()` converts
- 5 bridge tools: `send_context`, `get_messages`, `get_unread`, `assign_task`, `report_status`
- 6 memory tools: `search_memory`, `traverse_memory`, `get_context`, `create_memory_node`, `create_memory_link`, `ingest_conversation`

`ingest_conversation` accepts a conversation payload (messages array + metadata) and runs it through the generic ingestion pipeline. It's the MCP surface for `ingestGeneric`.

## Server & Route Registration (server.ts)

Fastify routes are registered via `ControllerDefinition[]` arrays. The server iterates them and calls `registerRoute()` with automatic Zod validation:

- `POST` routes return 201 on success
- Service errors map via `statusHint` → HTTP status (default 500)
- `ZodError` → 400 with `VALIDATION_ERROR` and field-level details
- On error, log and return `{ ok: false, error: { code, message } }`

The server factory `createServer(controllers)` never starts listening — that's `index.ts`'s job.

## Memory Services

`searchMemory` and `assembleContext` take both `MemoryDbClient` and `EmbeddingService`. `traverseMemory` takes only `MemoryDbClient` — do not pass `EmbeddingService` to it.

The embedding service may be in a degraded state — always check `embedService.isDegraded()` and fall back to keyword search if true (in services that use it).

Hybrid search uses Reciprocal Rank Fusion (RRF) to merge FTS5 and KNN result lists. The `searchMemory` service accepts `mode: "keyword" | "semantic" | "hybrid"`.

### traverseMemory return shape

`traverseMemory` returns `AppResult<TraverseResult>`:

```typescript
interface BFSStep {
  node_id: string;
  parent_id: string | null;
  edge_id: string | null;
  edge_kind: string | null;
}

interface TraverseResult {
  nodes: NodeRow[];
  edges: EdgeRow[];
  root: string;      // starting node ID
  steps: BFSStep[];  // BFS traversal trace (ordered visit sequence)
}
```

`TraverseInput.sender` (optional) filters non-root nodes: only nodes whose `sender` matches are included. Structural nodes (`sender = null`) are always included regardless of the filter.

### assembleContext return shape

`assembleContext` returns `AppResult<AssembleContextResult>`:

```typescript
interface ContextSection {
  heading: string;
  content: string;
  relevance: number;
  node_ids: string[];  // source node IDs for this section
}

interface AssembleContextResult {
  summary: string;
  sections: ContextSection[];
  token_estimate: number;  // rough estimate: text length / 4
}
```
