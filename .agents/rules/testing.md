---
description: Test infrastructure, shared helpers, and coverage policy
globs:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/vitest.config.ts"
  - "mcp-bridge/tests/helpers.ts"
paths:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/vitest.config.ts"
  - "mcp-bridge/tests/helpers.ts"
alwaysApply: false
---

# Testing Rules

## Test Infrastructure

Three Vitest packages, each with v8 coverage, `testTimeout: 10_000`, and 100% line/function/branch/statement thresholds in `vitest.config.ts` (enforced by `npm run test:coverage`):

| Package | Tests | Coverage excludes |
|---------|-------|-------------------|
| `mcp-bridge` | in-memory SQLite via `tests/helpers.ts`; route tests in `tests/routes/` | `src/index.ts` (entry point wiring), `src/mcp.ts` (stdio transport; tool handlers covered by `tests/mcp-tools.test.ts`) |
| `scorer` | transcript parsing, reports, probe summaries | `src/cli.ts` |
| `judge` | judge CLI logic | `src/cli.ts` |

`/* v8 ignore */` annotations are prohibited — write the test instead. (One legacy `/* v8 ignore next */` remains in `mcp-bridge/src/db/schema.ts`.)

## Shared Test Helpers (mcp-bridge)

`mcp-bridge/tests/helpers.ts` exports one factory — use it for every bridge test that needs a database:

```typescript
import { createTestBridgeDb } from "./helpers.js";

const { db, raw } = createTestBridgeDb(); // in-memory, WAL + foreign_keys + busy_timeout, MIGRATIONS applied
```

Never inline `new Database(":memory:")` — always go through the helper so pragma setup is consistent.

## Route Testing Pattern

Use Fastify's `app.inject()` for HTTP simulation — no real network. Build the app with `createServer([...routes])` and `await app.ready()`:

```typescript
const conv = randomUUID();
const res = await app.inject({
  method: "POST",
  url: "/messages/send",
  payload: { conversation: conv, sender: "claude", recipient: "codex", payload: "hello" },
});
expect(res.statusCode).toBe(201);
const body = res.json();
expect(body.ok).toBe(true);
expect(body.data.conversation).toBe(conv);
```

Conversation ids are validated as UUIDs — use `randomUUID()` in fixtures.

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
  expect(bad.error.code).toBe("NOT_FOUND");
  expect(bad.error.statusHint).toBe(404);
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

## Shell Tests

Bash suites live in `config/**/tests/`, `scripts/tests/`, and `providers/tests/` (`*.test.sh`, run with `bash <file>`). They must never touch the real `~/.claude`, `~/.codex`, `~/.cursor`, or `~/.agentic-workflow` — point `HOME` (or the relevant `AW_*`/`CLAUDE_*` path override) at a `mktemp -d` directory.

## Test Count Baseline

- mcp-bridge: 99 tests across 14 test files
- scorer: 235 tests across 20 test files
- judge: 261 tests across 22 test files

Any PR that reduces these counts needs explicit justification.
