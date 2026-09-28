---
description: MCP bridge service layer — AppResult, service contracts, MCP tools, route registration
globs:
  - "mcp-bridge/src/application/**"
  - "mcp-bridge/src/routes/**"
  - "mcp-bridge/src/server.ts"
  - "mcp-bridge/src/mcp.ts"
  - "mcp-bridge/src/index.ts"
paths:
  - "mcp-bridge/src/application/**"
  - "mcp-bridge/src/routes/**"
  - "mcp-bridge/src/server.ts"
  - "mcp-bridge/src/mcp.ts"
  - "mcp-bridge/src/index.ts"
alwaysApply: false
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

Standard error codes live in `ERROR_CODE` (`application/result.ts`): `NOT_FOUND` (404), `VALIDATION_ERROR` (400), `INTERNAL_ERROR` (500), `CONFLICT` (409). Always include `statusHint` so the server can map to HTTP status automatically.

## Services

Five services in `mcp-bridge/src/application/services/`, one per file:

| File | Exports |
|------|---------|
| `send-context.ts` | `sendContext` |
| `get-messages.ts` | `getMessagesByConversation`, `getUnreadMessages` |
| `assign-task.ts` | `assignTask` |
| `report-status.ts` | `reportStatus` |
| `get-conversations.ts` | `getConversations` |

## Service Function Contracts

- Services take `DbClient` as the first argument — never import a singleton
- Services take typed, Zod-validated inputs (not raw request bodies)
- Services are pure functions — no side effects beyond the provided DB client
- Services live in `mcp-bridge/src/application/services/`
- No service imports from transport layer (no Zod, no Fastify types)

## MCP Tool Pattern (mcp.ts)

All 5 MCP tools follow this structure — an inline Zod shape with `.describe()` on each field, a direct service call, and `resultToContent()`:

```typescript
server.tool(
  "tool_name",
  "description",
  { conversation: z.string().uuid().describe("Conversation UUID") },
  async ({ conversation }) => {
    const result = myService(db, conversation);
    return resultToContent(result);
    // ok path → pretty JSON string; error path → "Error [CODE]: message" with isError: true
  },
);
```

- Tools declare Zod shapes for all parameters (no coercion in the tool body)
- Tools never throw — services return AppResult, `resultToContent()` converts
- Tools: `send_context`, `get_messages`, `get_unread`, `assign_task`, `report_status`
- `tests/mcp-tools.test.ts` holds a copy of `resultToContent()` — keep both copies in sync

## Server & Route Registration (server.ts)

Fastify routes are registered via `ControllerDefinition[]` arrays. The server iterates them and calls `registerRoute()` with automatic Zod validation:

- `POST` routes return 201 on success
- Service errors map via `statusHint` → HTTP status (default 500)
- `ZodError` → 400 with `VALIDATION_ERROR` and field-level details
- On error, log and return `{ ok: false, error: { code, message } }`
- `GET /health` returns `{ status: "ok" }`

The server factory `createServer(controllers)` never starts listening — that's `index.ts`'s job.

## Entry Point (index.ts)

`index.ts` opens `bridge.db` (`DB_PATH`, default `mcp-bridge/bridge.db`), builds one `DbClient`, creates the message, task, and conversation route definitions, registers CORS, and listens on `PORT` (default 3100) / `HOST` (default `127.0.0.1`). It refuses to bind to a non-loopback host unless `ALLOW_REMOTE` is set — the server has no authentication.
