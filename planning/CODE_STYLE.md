# Code Style Guide

This document captures the TypeScript conventions used across the `mcp-bridge` package. All new code must follow these rules.

---

## TypeScript Strict Mode

The project compiles with `"strict": true` in `tsconfig.json`. Key compiler flags:

| Flag | Value | Effect |
|------|-------|--------|
| `strict` | `true` | Enables all strict type-checking options |
| `target` | `ES2022` | Top-level await, `Array.at()`, etc. |
| `module` | `Node16` | ESM with `.js` extensions in imports |
| `moduleResolution` | `Node16` | Node-style resolution for ESM |
| `forceConsistentCasingInFileNames` | `true` | Prevents cross-platform casing bugs |
| `declaration` | `true` | Generates `.d.ts` files |

The `package.json` declares `"type": "module"`, so **all imports must use the `.js` extension**, even when importing `.ts` source files:

```ts
// Correct
import { ok } from "../result.js";
import type { DbClient } from "../../db/client.js";

// Wrong - will fail at runtime
import { ok } from "../result";
```

---

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files and directories | `kebab-case` | `send-context.ts`, `message-controller.ts`, `message-schemas.ts` |
| Interfaces and type aliases | `PascalCase` | `MessageRow`, `AppResult<T>`, `RouteSchema` |
| Functions | `camelCase` | `createDbClient`, `sendContext`, `defineRoute` |
| Constants (error code maps) | `UPPER_SNAKE_CASE` | `ERROR_CODE.notFound`, `MIGRATIONS` |
| Zod schemas | `PascalCase` + `Schema` suffix | `SendContextBodySchema`, `MessageResponseSchema` |
| Zod companion types | Same name as schema, without "Schema" where it refers to the inferred data type | `MessageResponse`, `SendContextBody` |
| Route schema objects | `PascalCase` + `Schema` suffix (doubles as value and type) | `SendContextSchema` (value and type) |
| Database row types | `PascalCase` + `Row` suffix | `MessageRow`, `TaskRow` |
| Service input types | `PascalCase` + `Input` suffix | `SendContextInput`, `AssignTaskInput` |
| Service result types | `PascalCase` + `Result` suffix | `ReportStatusResult` |

---

## Import Ordering

Imports follow this order, separated by blank lines where it aids readability:

1. **Type-only imports** (`import type`) from external packages
2. **Type-only imports** from internal modules
3. **Value imports** from external packages
4. **Value imports** from internal modules

```ts
import type { z, ZodType } from "zod";

import type { DbClient, MessageRow } from "../../db/client.js";
import type { AppResult } from "../result.js";
import { ok, err, ERROR_CODE } from "../result.js";
```

Use `import type` wherever possible. If a symbol is used only in type position, always import it with `import type`.

---

## The `AppResult` Pattern

**Services never throw.** Every service function returns `AppResult<T>` -- a discriminated union:

```ts
export type AppResult<T> = { ok: true; data: T } | { ok: false; error: AppError };

export interface AppError {
  code: string;
  message: string;
  statusHint?: number;
  details?: unknown;
}
```

Use the `ok()` and `err()` helpers from `application/result.ts`:

```ts
import { ok, err, ERROR_CODE } from "../result.js";

// Returning success
return ok(row);

// Returning a typed error
return err({
  code: ERROR_CODE.notFound,
  message: `Task ${id} not found`,
  statusHint: 404,
});
```

Standard error codes are defined in `ERROR_CODE`:

| Constant | Value | Typical HTTP hint |
|----------|-------|-------------------|
| `ERROR_CODE.notFound` | `"NOT_FOUND"` | 404 |
| `ERROR_CODE.validation` | `"VALIDATION_ERROR"` | 400 |
| `ERROR_CODE.internal` | `"INTERNAL_ERROR"` | 500 |
| `ERROR_CODE.conflict` | `"CONFLICT"` | 409 |

---

## Service Functions

Services live in `src/application/services/`. Each file exports one or more pure functions that accept `DbClient` as the first argument and a typed input as the second:

```ts
export interface SendContextInput {
  conversation: string;
  sender: string;
  recipient: string;
  payload: string;
  meta_prompt?: string;
}

export function sendContext(db: DbClient, input: SendContextInput): AppResult<MessageRow> {
  const row = db.insertMessage({
    conversation: input.conversation,
    sender: input.sender,
    recipient: input.recipient,
    kind: "context",
    payload: input.payload,
    meta_prompt: input.meta_prompt ?? null,
  });
  return ok(row);
}
```

Rules:
- First parameter is always `DbClient`.
- Define an `*Input` interface for the second parameter.
- Return `AppResult<T>`, never throw.
- Use `db.transaction()` when multiple writes must be atomic.
- Validate preconditions (e.g., check existence) **before** any writes.

---

## `RouteSchema` / `defineRoute` Pattern

Route definitions live in `src/routes/`. Each file exports a function `create*Routes(db: DbClient): ControllerDefinition`.

A `RouteSchema` object bundles Zod schemas for `body`, `params`, `querystring`, and `response`:

```ts
export const SendContextSchema = {
  body: SendContextBodySchema,
  response: MessageResponseSchema,
} as const;
export type SendContextSchema = typeof SendContextSchema;
```

Routes are registered using the `defineRoute` identity function, which captures the schema type parameter at compile time:

```ts
defineRoute({
  method: "POST",
  path: "/send",
  summary: "Send context from one agent to another",
  schema: SendContextSchema,
  handler: handlers.send,
})
```

The `handler` function receives a fully typed `ApiRequest<TSchema>` where `body`, `params`, and `query` are inferred from the schema. The server (`server.ts`) handles Zod validation automatically -- handlers never call `.parse()` themselves.

---

## Zod Schema Naming

Schemas follow a consistent pattern with companion type aliases:

```ts
// 1. Define the Zod schema with PascalCase + Schema suffix
export const MessageResponseSchema = z.object({
  id: z.string().uuid(),
  conversation: z.string().uuid(),
  sender: z.string(),
  // ...
});

// 2. Export a companion type alias using z.infer
export type MessageResponse = z.infer<typeof MessageResponseSchema>;
```

For route-level schema objects that are used as both a value and a type (the "dual declaration" pattern):

```ts
// Value -- the actual object containing Zod schemas
export const GetMessagesSchema = {
  params: ConversationParamsSchema,
  response: z.array(MessageResponseSchema),
} as const;

// Type -- used in ApiRequest<GetMessagesSchema>
export type GetMessagesSchema = typeof GetMessagesSchema;
```

This dual declaration is required because TypeScript uses the value in `defineRoute()` and the type in `ApiRequest<T>` generics.

---

## Controller Pattern

Controllers live in `src/transport/controllers/`. Each file exports a factory function that receives `DbClient` and returns an object of handler methods:

```ts
export function createMessageController(db: DbClient) {
  return {
    async send(req: ApiRequest<SendContextSchema>): Promise<ApiResponse<MessageResponse>> {
      const result = sendContext(db, req.body);
      if (!result.ok) return appErr(result.error);
      return { ok: true, data: result.data };
    },
    // ...
  };
}
```

Controllers are thin: they forward to service functions and translate `AppResult` into `ApiResponse`. The `appErr()` helper converts an `AppError` into the `ApiResponse` error shape.

---

## Test File Conventions

Tests use **vitest** and live in the `tests/` directory at the package root. File naming: `*.test.ts`.

### Setup

Each test file creates an in-memory SQLite database per test:

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

### Assertions

- Use `result.ok` discriminator checks before accessing `.data` or `.error`:
  ```ts
  expect(result.ok).toBe(true);
  if (!result.ok) return; // narrows the type
  expect(result.data.conversation).toBe(conv);
  ```
- Test both success and error paths.
- For atomic operations, verify that failed operations leave no orphaned records:
  ```ts
  // Verify no orphaned message was created
  const msgs = getMessagesByConversation(db, conv);
  expect(msgs.ok).toBe(true);
  if (!msgs.ok) return;
  expect(msgs.data).toHaveLength(0);
  ```

### Test Organization

- Group by service function using `describe()`.
- Use descriptive `it()` strings that state the expected behavior.
- Use `randomUUID()` for test isolation -- each test gets unique conversation IDs.

---

## Section Comment Style

Use ASCII box-drawing headers to separate logical sections within a file:

```ts
// ── Row types ──────────────────────────────────────────────

// ── Database client ────────────────────────────────────────

// ── Error helper ───────────────────────────────────────────
```

Use `/** JSDoc */` comments for interface and function documentation, not `//`.
