---
globs: ["**/*.test.ts", "**/*.spec.ts", "**/vitest.config.ts", "mcp-bridge/tests/helpers.ts"]
---

# Testing Rules

## Test Infrastructure

**Bridge tests** — Vitest with v8 coverage, in-memory SQLite (WAL mode, foreign_keys ON), 10s timeout per test. Shared helpers in `mcp-bridge/tests/helpers.ts` — use them instead of duplicating setup.

**UI tests** — Vitest with `happy-dom` environment, `@` path alias pointing to `src/`, global `MockEventSource` defined in `ui/__tests__/setup.ts`. Tests cover `hooks/**/*.ts` and `lib/**/*.ts` only; `types.ts` is excluded.

**Coverage policy:** Coverage thresholds are not enforced at the `vitest.config.ts` level — neither `mcp-bridge` nor `ui` have a `thresholds` key configured. `/* v8 ignore */` annotations are prohibited — write the test instead.

## Shared Test Helpers

Always use the shared factory functions from `tests/helpers.ts`:

```typescript
// Bridge tests
import { createTestBridgeDb, createTestMemoryDb, createMockEmbeddingService } from "./helpers.js";

const { db, raw } = createTestBridgeDb();          // in-memory with pragmas applied
const { mdb, raw } = createTestMemoryDb();         // loads sqlite-vec extension, applies memory schema
const embedService = createMockEmbeddingService(); // returns zero-filled Float32Arrays
```

Never inline `new Database(":memory:")` — always go through helpers so pragma setup is consistent.

## Route Testing Pattern

Use Fastify's `app.inject()` for HTTP simulation — no real network:

```typescript
const response = await app.inject({
  method: "POST",
  url: "/messages/send",
  payload: { conversation: "conv-1", sender: "agent-a", recipient: "agent-b", payload: "hello" },
});
expect(response.statusCode).toBe(201);
const body = JSON.parse(response.body);
expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
```

## AppResult Test Coverage

Always test both paths of AppResult-returning services:

```typescript
// OK path
const result = myService(db, validInput);
expect(result.ok).toBe(true);
if (result.ok) expect(result.data.id).toBeDefined();

// Error path
const bad = myService(db, invalidInput);
expect(bad.ok).toBe(false);
if (!bad.ok) {
  expect(bad.error.code).toBe("VALIDATION_ERROR");
  expect(bad.error.statusHint).toBe(400);
}
```

## Zod Validation Tests

Test validation rejection with invalid inputs — don't assume the happy path is enough:

```typescript
// Invalid UUID
const res = await app.inject({ method: "GET", url: "/messages/conversation/not-a-uuid" });
expect(res.statusCode).toBe(400);

// Missing required field
const res2 = await app.inject({ method: "POST", url: "/messages/send", payload: { sender: "a" } });
expect(res2.statusCode).toBe(400);
```

## EventBus Tests

Test event emission by subscribing before the action that emits:

```typescript
const events: BridgeEvent[] = [];
const unsub = bus.subscribe((event) => events.push(event));

await controller.send(req);
expect(events).toHaveLength(1);
expect(events[0].type).toBe("message:created");
unsub();
```

## Memory / Graph Tests

FTS5 and KNN tests require a real `createTestMemoryDb()` with sqlite-vec loaded. For embedding tests that don't need real models, use `createMockEmbeddingService()` — it returns `Float32Array` filled with zeros, which is valid for schema/storage tests but not semantic similarity tests.

## Excluded from Coverage

- `mcp-bridge/src/index.ts` — entry point wiring; covered by integration
- `mcp-bridge/src/mcp.ts` — MCP stdio transport; covered by MCP tool tests
- `ui/src/lib/types.ts` — type-only exports; no runtime code

## Test Count Baseline

- Bridge: 341 tests across 39 test files
- UI: 67 tests

Any PR that reduces these counts needs explicit justification.
