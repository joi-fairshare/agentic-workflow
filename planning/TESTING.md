# Testing Strategy

## Overview

All tests run against **in-memory SQLite** databases. Each test gets a fresh database instance via `beforeEach`, so tests are fully isolated, deterministic, and fast -- no filesystem cleanup or shared state.

The test suite uses **Vitest** with explicit imports (globals are disabled in the config).

## Test Location

```
mcp-bridge/
  tests/
    services.test.ts    # Service-layer unit tests
  vitest.config.ts      # Vitest configuration
```

Tests live in `mcp-bridge/tests/`. The `tsconfig.json` excludes `tests/` from compilation output, but Vitest picks them up at runtime via `tsx`.

## Running Tests

```bash
cd mcp-bridge

# Single run (CI-friendly)
npm run test

# Watch mode (re-runs on file changes)
npm run test:watch

# Type-check only (no emit)
npm run typecheck
```

Under the hood:
- `npm run test` runs `vitest run` (single pass, exits with code 0/1)
- `npm run test:watch` runs `vitest` (interactive watch mode)
- `npm run typecheck` runs `tsc --noEmit` (validates types without producing output)

## Test Configuration

From `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    testTimeout: 10_000,
  },
});
```

- **`globals: false`** -- All Vitest functions (`describe`, `it`, `expect`, `beforeEach`) must be explicitly imported.
- **`testTimeout: 10_000`** -- 10-second timeout per test (generous for in-memory SQLite operations).

## Test Patterns

### Fresh Database per Test

Every test starts with a clean in-memory SQLite database. The `beforeEach` hook creates the database, runs migrations, and wraps it in the `DbClient` interface:

```ts
import { describe, it, expect, beforeEach } from "vitest";
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

This pattern ensures:
- No test pollution -- each test has its own tables with zero rows.
- No disk I/O -- `:memory:` databases are purely in-RAM.
- Real schema -- the same `MIGRATIONS` SQL that runs in production creates the tables.

### AppResult Assertion Pattern

All service functions return `AppResult<T>`, a discriminated union:

```ts
type AppResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }
```

Tests assert on the `ok` flag first, then narrow the type with a guard before accessing `data` or `error`:

```ts
it("inserts a message and returns it", () => {
  const conv = randomUUID();
  const result = sendContext(db, {
    conversation: conv,
    sender: "claude-code",
    recipient: "codex",
    payload: "Hello from Claude",
    meta_prompt: "Analyze this codebase",
  });

  expect(result.ok).toBe(true);
  if (!result.ok) return;          // Type narrowing guard
  expect(result.data.conversation).toBe(conv);
  expect(result.data.sender).toBe("claude-code");
  expect(result.data.kind).toBe("context");
  expect(result.data.read_at).toBeNull();
});
```

For error cases, the same pattern is inverted:

```ts
it("returns error for unknown task_id without inserting a message", () => {
  const result = reportStatus(db, {
    conversation: conv,
    sender: "codex",
    recipient: "claude-code",
    task_id: randomUUID(),
    status: "completed",
    payload: "Done",
  });

  expect(result.ok).toBe(false);
  if (result.ok) return;           // Type narrowing guard
  expect(result.error.code).toBe("NOT_FOUND");
});
```

### Conversation Isolation via randomUUID

Each test generates its own conversation UUID with `randomUUID()`, so even if tests share a database (they don't due to `beforeEach`), data would not collide:

```ts
const conv = randomUUID();
```

### Verifying Side Effects

Tests that touch multiple tables verify both the primary return value and side effects. For example, `assignTask` creates both a task record and a conversation message:

```ts
it("creates a task and a conversation message atomically", () => {
  const conv = randomUUID();
  const result = assignTask(db, {
    conversation: conv,
    domain: "backend",
    summary: "Fix auth bug",
    details: "JWT validation is missing",
    assigned_to: "codex",
  });

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.data.domain).toBe("backend");
  expect(result.data.status).toBe("pending");

  // Check that a message was also created
  const msgs = getMessagesByConversation(db, conv);
  expect(msgs.ok).toBe(true);
  if (!msgs.ok) return;
  expect(msgs.data).toHaveLength(1);
  expect(msgs.data[0].kind).toBe("task");
});
```

For error cases, tests verify that no orphaned records were created (transactional integrity):

```ts
// Verify no orphaned message was created
const msgs = getMessagesByConversation(db, conv);
expect(msgs.ok).toBe(true);
if (!msgs.ok) return;
expect(msgs.data).toHaveLength(0);
```

## Coverage Targets

The current test suite covers the service layer (`src/application/services/`):

| Service | Tested |
|---------|--------|
| `sendContext` | Insert + return shape |
| `getMessagesByConversation` | Chronological order, empty conversation |
| `getUnreadMessages` | Returns unread, marks as read, subsequent call returns empty |
| `assignTask` | Task creation + message side effect |
| `reportStatus` | Status update + task mutation, error on missing task |

Coverage targets to aim for:
- **Service layer**: 100% of exported functions should have happy-path and error-path tests.
- **Transport/route layer**: Integration tests against Fastify's `inject()` method (not yet implemented).
- **MCP tool layer**: Validate Zod schemas reject malformed input (not yet implemented).

## Writing New Tests

1. Add test files to `mcp-bridge/tests/` with the `.test.ts` suffix.
2. Import from `vitest` explicitly (globals are off).
3. Use the `beforeEach` pattern above for database setup.
4. Return `AppResult<T>` from all service functions -- never throw.
5. Use `randomUUID()` for conversation/task IDs.
6. Assert `result.ok` first, then narrow with a guard before accessing `.data` or `.error`.
