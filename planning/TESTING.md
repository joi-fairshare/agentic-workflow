# Testing Strategy

## Overview

All tests run against **in-memory SQLite** databases. Each test gets a fresh database instance via `beforeEach`, so tests are fully isolated, deterministic, and fast -- no filesystem cleanup or shared state.

The test suite uses **Vitest** with explicit imports (globals are disabled in the config).

## Coverage Policy

**`/* v8 ignore */` annotations are prohibited.** Never use `/* v8 ignore next */`, `/* v8 ignore start */`, or any v8 ignore variant to reach coverage targets. Coverage must be earned through real tests, not hidden with annotations.

`mcp-bridge`, `scorer`, and `judge` each set 100% line/function/branch/statement thresholds in `vitest.config.ts`, so `npm run test:coverage` fails below 100%. Gaps are closed by writing the missing tests, not by ignoring lines.

| Metric | Target (all three packages) |
|--------|----------------------|
| Statements | 100% (through real tests) |
| Branches | 100% (through real tests) |
| Functions | 100% (through real tests) |
| Lines | 100% (through real tests) |

Entry-point files are excluded from coverage collection: `mcp-bridge/src/index.ts` and `src/mcp.ts`, and `src/cli.ts` in `scorer` and `judge`.

## Test Locations

```
mcp-bridge/tests/
├── result.test.ts              # AppResult, ERROR_CODE constants
├── types.test.ts               # RouteSchema, defineRoute
├── schema.test.ts              # createDatabase, WAL mode
├── client.test.ts              # DbClient CRUD operations
├── services.test.ts            # Service-layer unit tests (send, get, assign, report)
├── conversations.test.ts       # Conversation summary service
├── message-controller.test.ts  # Message controller: send, getByConversation, getUnread
├── task-controller.test.ts     # Task controller: assign, get, report
├── conversation-controller.test.ts  # Conversation controller: list
├── server-errors.test.ts       # Server error handling: ZodError→400, generic→500, details field
├── mcp-tools.test.ts           # MCP tool handler tests with resultToContent
├── routes/
│   ├── messages.test.ts        # POST /messages/send, GET conversation/:id, GET /unread
│   ├── tasks.test.ts           # POST /tasks/assign, GET /:id, POST /report
│   └── conversations.test.ts   # GET /conversations, /health
└── helpers.ts                  # Shared test helpers: createTestBridgeDb
```

## Running Tests

```bash
# MCP Bridge
cd mcp-bridge
npm test               # Vitest single run (CI-friendly)
npm run test:watch     # Vitest watch mode
npm run test:coverage  # Run with coverage report (fails below 100%)
npm run typecheck      # tsc --noEmit

```

## Test Patterns

### Fresh Database per Test (MCP Bridge)

Every test starts with a clean in-memory SQLite database from the shared helper in `tests/helpers.ts` (never inline `new Database(":memory:")`):

```ts
import type { DbClient } from "../src/db/client.js";
import { createTestBridgeDb } from "./helpers.js";

let db: DbClient;

beforeEach(() => {
  ({ db } = createTestBridgeDb()); // in-memory, WAL + foreign_keys + busy_timeout, MIGRATIONS applied
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

Controllers need a typed `ApiRequest`:

```ts
const controller = createMessageController(db);

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
const app = createServer([messageRoutes(db)]);
await app.ready();

const res = await app.inject({
  method: "POST",
  url: "/messages/send",
  payload: { conversation: randomUUID(), sender: "a", recipient: "b", payload: "hi" }, // conversation must be a UUID
});
expect(res.statusCode).toBe(201);
```

### Coverage Gaps

Some paths are hard to exercise in unit tests (process entry points, real timers, filesystem races). Keep them out of `src/**` logic where possible (entry points are excluded above) and test the rest directly — never annotate them away.

`/* v8 ignore */` annotations are prohibited in this codebase.

## Writing New Tests

1. Add test files to the package's `tests/` directory with `.test.ts` suffix.
2. Import from `vitest` explicitly (globals are off).
3. Use `createTestBridgeDb()` in `beforeEach` for bridge tests.
4. Return `AppResult<T>` from all service functions — never throw.
5. Use `randomUUID()` for conversation/task IDs.
6. Assert `result.ok` first, then narrow with a guard.
7. Never add `/* v8 ignore */` annotations — write the test instead.
