---
description: MCP bridge transport layer — typed routes, controller factories, Zod schemas
globs:
  - "mcp-bridge/src/transport/**"
paths:
  - "mcp-bridge/src/transport/**"
alwaysApply: false
---

# Bridge Transport Rules

## Typed Router Pattern

Use `defineRoute<TSchema>()` to link Zod schemas to handler signatures at compile time. The identity function captures the generic type parameter, enabling full type inference in the handler.

```typescript
import { defineRoute, type ControllerDefinition, type RouteEntry } from "../transport/types.js";
import { z } from "zod";

export const MySchema = {
  body: z.object({ name: z.string().min(1), value: z.number() }),
  response: z.object({ id: z.string().uuid(), created: z.boolean() }),
} as const;
export type MySchema = typeof MySchema;

export function createThingRoutes(db: DbClient): ControllerDefinition {
  const handlers = createThingController(db);
  return {
    basePath: "/things",
    routes: [
      defineRoute({
        method: "POST",
        path: "/create",
        summary: "Create a thing",
        schema: MySchema,
        handler: handlers.create, // (req: ApiRequest<MySchema>) — req.body is { name: string; value: number }
      }),
    ] as RouteEntry[],
  };
}
```

Route definitions live in `mcp-bridge/src/routes/` (`messages.ts`, `tasks.ts`, `conversations.ts`); the full path is `basePath + path`.

`RouteSchema` interface allows optional `body`, `params`, `querystring`, and required `response`. Missing fields are typed as `undefined` in the request object.

## Controller Factory Pattern

Controllers are factory functions, not classes. They take infrastructure deps and return route handler methods:

```typescript
export function createThingController(db: DbClient) {
  return {
    async create(req: ApiRequest<MySchema>): Promise<ApiResponse<{ id: string; created: boolean }>> {
      const result = createThing(db, req.body);
      if (!result.ok) return appErr(result.error);
      return { ok: true, data: { id: result.data.id, created: true } };
    },
  };
}
```

Use `appErr(error)` helper to convert `AppError` → `ApiResponse` error shape.

## Zod Schema Conventions

| Use case | Pattern |
|----------|---------|
| UUID parameter | `z.string().uuid()` |
| Non-empty string | `z.string().min(1)` |
| Enum values | `z.enum(["a", "b", "c"])` |
| Optional with default | `z.number().int().positive().default(20)` |
| JSON blob | `z.record(z.unknown()).optional()` |

Group shared schemas in `transport/schemas/common.ts`:
- `IdParamsSchema` — `{ id: z.string().uuid() }`
- `ConversationParamsSchema` — `{ conversation: z.string().uuid() }`
- `RecipientQuerySchema` — `{ recipient: z.string().min(1) }`

Route schemas are plain `{ body?, params?, querystring?, response }` objects declared `as const`, with a same-named type alias (`export type SendContextSchema = typeof SendContextSchema`).

Export both the schema and its inferred type:
```typescript
export const FooSchema = z.object({ ... });
export type FooInput = z.infer<typeof FooSchema>;
```

## Schema Files

| File | Contents |
|------|----------|
| `schemas/common.ts` | `IdParamsSchema`, `ConversationParamsSchema`, `RecipientQuerySchema` |
| `schemas/message-schemas.ts` | `MessageResponseSchema`, `SendContextSchema`, `GetMessagesSchema`, `GetUnreadSchema` |
| `schemas/task-schemas.ts` | `TaskResponseSchema`, `AssignTaskSchema`, `GetTaskSchema`, `GetTasksByConversationSchema`, `ReportStatusSchema` |
| `schemas/conversation-schemas.ts` | `ConversationsResponseSchema`, `GetConversationsSchema` (pagination: `limit` 1–100 default 20, `offset` default 0) |

## Controller Files

| File | Methods |
|------|---------|
| `controllers/message-controller.ts` | `send`, `getByConversation`, `getUnread` |
| `controllers/task-controller.ts` | `assign`, `get`, `getByConversation`, `report` |
| `controllers/conversation-controller.ts` | `list` (with pagination) |

## HTTP Routes

| Method + path | Handler |
|---------------|---------|
| `POST /messages/send` | `message.send` |
| `GET /messages/conversation/:conversation` | `message.getByConversation` |
| `GET /messages/unread?recipient=` | `message.getUnread` |
| `POST /tasks/assign` | `task.assign` |
| `GET /tasks/:id` | `task.get` |
| `GET /tasks/conversation/:conversation` | `task.getByConversation` |
| `POST /tasks/report` | `task.report` |
| `GET /conversations?limit=&offset=` | `conversation.list` |
| `GET /health` | inline in `server.ts` |

## ApiRequest Structure

```typescript
interface ApiRequest<TSchema extends RouteSchema> {
  params: InferParams<TSchema>;
  query: InferQuery<TSchema>;
  body: InferBody<TSchema>;
  requestId: string;
}
```

`requestId` is Fastify's request id (`request.id`) — use it for logging correlation.

## ApiResponse Union

```typescript
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown; statusHint?: number } };
```

Controllers return `ApiResponse`. The server serializes `ok: true` → 201/200 and `ok: false` → `statusHint` HTTP status.
