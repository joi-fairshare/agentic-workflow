# Testing Strategy

## Overview

All tests run against **in-memory SQLite** databases. Each test gets a fresh database instance via `beforeEach`, so tests are fully isolated, deterministic, and fast -- no filesystem cleanup or shared state.

The test suite uses **Vitest** with explicit imports (globals are disabled in the config).

## Coverage Policy

**`/* v8 ignore */` annotations are prohibited.** Never use `/* v8 ignore next */`, `/* v8 ignore start */`, or any v8 ignore variant to reach coverage targets. Coverage must be earned through real tests, not hidden with annotations.

Coverage thresholds are not enforced as hard build failures. The goal is still 100% — but gaps should be addressed by writing the missing tests, not by ignoring lines. `npm run test:coverage` will report coverage without failing on low numbers.

| Metric | Target (both packages) |
|--------|----------------------|
| Statements | 100% (through real tests) |
| Branches | 100% (through real tests) |
| Functions | 100% (through real tests) |
| Lines | 100% (through real tests) |

Entry-point files (`index.ts`, `mcp.ts`) and type-only files (`types.ts`) are excluded from coverage collection.

## Test Locations

```
mcp-bridge/tests/
├── result.test.ts              # AppResult, ERROR_CODE constants
├── types.test.ts               # RouteSchema, defineRoute
├── memory-schema.test.ts       # Memory DDL, NODE_KINDS, EDGE_KINDS
├── schema.test.ts              # createDatabase, WAL mode
├── client.test.ts              # DbClient CRUD operations
├── memory-client.test.ts       # MemoryDbClient: nodes, edges, FTS, KNN, cursors
├── events.test.ts              # EventBus: emit, subscribe, unsubscribe
├── embedding.test.ts           # EmbeddingService: embed, batch, warmUp, degraded
├── secret-filter.test.ts       # Secret detection and redaction
├── queue.test.ts               # BoundedQueue: enqueue, backpressure, drop
├── transcript-parser.test.ts   # JSONL transcript parsing
├── services.test.ts            # Service-layer unit tests (send, get, assign, report)
├── conversations.test.ts       # Conversation summary service
├── search-memory.test.ts       # Hybrid search: FTS5, KNN, RRF, degraded mode
├── traverse-memory.test.ts     # BFS graph traversal
├── assemble-context.test.ts    # Token-budgeted context assembly
├── ingest-bridge.test.ts       # Bridge message → memory node pipeline
├── ingest-git.test.ts          # Git metadata ingestion (mocked execFileSync)
├── ingest-transcript.test.ts   # JSONL transcript ingestion
├── extract-decisions.test.ts   # Decision extraction via regex heuristics
├── infer-topics.test.ts        # Topic inference via embedding clustering
├── message-controller.test.ts  # Message controller: send, getByConversation, getUnread
├── task-controller.test.ts     # Task controller: assign, get, report
├── conversation-controller.test.ts  # Conversation controller: list
├── memory-controller.test.ts   # Memory controller: search, traverse, context, createNode, createLink
├── server-errors.test.ts       # Server error handling: ZodError→400, generic→500, details field
├── sse-integration.test.ts     # Real TCP SSE: headers, events, cleanup
├── mcp-tools.test.ts           # MCP tool handler tests with resultToContent
├── routes/
│   ├── messages.test.ts        # POST /messages/send, GET conversation/:id, GET /unread
│   ├── tasks.test.ts           # POST /tasks/assign, GET /:id, POST /report
│   ├── conversations.test.ts   # GET /conversations, /health
│   ├── events.test.ts          # SSE route registration
│   └── memory.test.ts          # All 10 memory routes

ui/__tests__/
├── setup.ts                    # Global fetch mock, MockEventSource
├── lib/
│   ├── diagrams.test.ts        # buildDirectedGraph, buildSequenceDiagram
│   ├── api.test.ts             # fetchConversations, fetchMessages, fetchTasks
│   └── memory-api.test.ts      # All memory API client functions
└── hooks/
    ├── use-sse.test.ts         # SSE hook: lifecycle, events, error, cleanup
    ├── use-memory-search.test.ts    # Search hook: state, search, kinds, errors
    ├── use-memory-traverse.test.ts  # Traverse hook: selectNode, clearNode
    └── use-context-assembler.test.ts # Context hook: assemble, budget, clear
```

## Running Tests

```bash
# MCP Bridge
cd mcp-bridge
npm test               # Vitest single run (CI-friendly)
npm run test:watch     # Vitest watch mode
npm run test:coverage  # Run with coverage report (no threshold enforcement)
npm run typecheck      # tsc --noEmit

# UI
cd ui
npm test               # Vitest single run
npm run test:watch     # Vitest watch mode
npm run test:coverage  # Run with coverage report (no threshold enforcement)
```

## Test Patterns

### Fresh Database per Test (MCP Bridge)

Every test starts with a clean in-memory SQLite database:

```ts
import Database from "better-sqlite3";
import { createDbClient, type DbClient } from "../src/db/client.js";
import { MIGRATIONS } from "../src/db/schema.js";

let db: DbClient;

beforeEach(() => {
  const raw = new Database(":memory:");
  raw.pragma("journal_mode = WAL");
  raw.exec(MIGRATIONS);
  db = createDbClient(raw);
});
```

### Memory Database Setup

Memory tests need sqlite-vec loaded:

```ts
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { createMemoryDbClient } from "../src/db/memory-client.js";
import { MEMORY_MIGRATIONS } from "../src/db/memory-schema.js";

beforeEach(() => {
  const raw = new Database(":memory:");
  sqliteVec.load(raw);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  raw.exec(MEMORY_MIGRATIONS);
  mdb = createMemoryDbClient(raw);
});
```

### AppResult Assertion Pattern

Assert `ok` first, then narrow with a guard:

```ts
const result = sendContext(db, { ... });
expect(result.ok).toBe(true);
if (!result.ok) return;          // Type narrowing guard
expect(result.data.conversation).toBe(conv);
```

### Controller Test Pattern

Controllers need a mock EventBus and typed `ApiRequest`:

```ts
const bus = createEventBus();
const controller = createMessageController(db, bus);

const result = await controller.send({
  body: { conversation: "c1", sender: "a", recipient: "b", payload: "hello" },
  params: undefined as never,
  query: undefined as never,
  requestId: "test",
});
```

### Route Integration Test Pattern

Route tests use Fastify `inject()` for full HTTP-layer coverage without a live server:

```ts
const app = createServer([messageRoutes(db, bus)]);
await app.ready();

const res = await app.inject({
  method: "POST",
  url: "/messages/send",
  payload: { conversation: "c1", sender: "a", recipient: "b", payload: "hi" },
});
expect(res.statusCode).toBe(201);
```

### SSE Integration Tests

SSE uses `reply.raw.writeHead()` which bypasses Fastify's inject. Tests use real TCP connections:

```ts
const app = createSseTestServer(eventBus);
await app.listen({ port: 0, host: "127.0.0.1" });
const port = (app.server.address() as AddressInfo).port;
// Use http.get for real TCP connection
```

### UI Hook Test Pattern

UI tests use happy-dom, `@testing-library/react`, and module mocks:

```ts
import { renderHook, act } from "@testing-library/react";
import { useMemorySearch } from "@/hooks/use-memory-search";

vi.mock("@/lib/memory-api", () => ({
  searchMemory: vi.fn(),
}));

const { result } = renderHook(() => useMemorySearch("repo"));
act(() => result.current.setQuery("test"));
await act(async () => result.current.search());
```

### Coverage Gaps

Some paths are genuinely difficult to exercise in unit tests (real model loading, 30-second timers, floating-point edge cases). These currently appear as uncovered lines in coverage reports. The right response is to write the missing tests over time — not to annotate them away.

`/* v8 ignore */` annotations are prohibited in this codebase.

## Writing New Tests

1. Add test files to the appropriate `tests/` or `__tests__/` directory with `.test.ts` suffix.
2. Import from `vitest` explicitly (globals are off).
3. Use the `beforeEach` database setup pattern for bridge tests.
4. Return `AppResult<T>` from all service functions — never throw.
5. Use `randomUUID()` for conversation/task IDs.
6. Assert `result.ok` first, then narrow with a guard.
7. Never add `/* v8 ignore */` annotations — write the test instead.
