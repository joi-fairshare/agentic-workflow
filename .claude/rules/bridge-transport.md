---
globs: ["mcp-bridge/src/transport/**"]
---

# Bridge Transport Rules

## Typed Router Pattern

Use `defineRoute<TSchema>()` to link Zod schemas to handler signatures at compile time. The identity function captures the generic type parameter, enabling full type inference in the handler.

```typescript
import { defineRoute, type RouteSchema } from "../transport/types.js";
import { z } from "zod";

const MySchema = {
  body: z.object({ name: z.string().min(1), value: z.number() }),
  params: z.object({ id: z.string().uuid() }),
  response: z.object({ id: z.string(), created: z.boolean() }),
} satisfies RouteSchema;

export const myRoute = defineRoute<typeof MySchema>({
  method: "POST",
  url: "/things/:id",
  summary: "Create a thing",
  schema: MySchema,
  handler: async (req) => {
    // req.body is typed as { name: string; value: number }
    // req.params is typed as { id: string }
    return controller.create(req);
  },
});
```

`RouteSchema` interface allows optional `body`, `params`, `querystring`, and required `response`. Missing fields are typed as `undefined` in the request object.

## Controller Factory Pattern

Controllers are factory functions, not classes. They take infrastructure deps and return route handler methods:

```typescript
export function createMyController(db: DbClient, bus: EventBus) {
  return {
    create: async (req: ApiRequest<typeof MySchema>): Promise<ApiResponse<{ id: string }>> => {
      const result = myService(db, req.body);
      if (!result.ok) return appErr(result.error);
      bus.emit({ type: "thing:created", data: result.data });
      return { ok: true, data: { id: result.data.id } };
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
- `ConversationParamsSchema` — `{ conversation: z.string().min(1) }`

Export both the schema and its inferred type:
```typescript
export const FooSchema = z.object({ ... });
export type FooInput = z.infer<typeof FooSchema>;
```

## Schema Files

| File | Contents |
|------|----------|
| `schemas/common.ts` | Shared param/query schemas (UUID params, conversation params, pagination) |
| `schemas/message-schemas.ts` | `SendContextSchema`, `GetMessagesSchema`, `GetUnreadSchema` |
| `schemas/task-schemas.ts` | `AssignTaskSchema`, `ReportStatusSchema` |
| `schemas/conversation-schemas.ts` | Pagination params (limit, offset) |
| `schemas/memory-schemas.ts` | `SearchInputSchema`, `TraverseInputSchema`, context assembly schemas |

## Controller Files

| File | Methods |
|------|---------|
| `controllers/message-controller.ts` | `send`, `getByConversation`, `getUnread` |
| `controllers/task-controller.ts` | `assign`, `get`, `getByConversation`, `report` |
| `controllers/conversation-controller.ts` | `list` (with pagination) |
| `controllers/memory-controller.ts` | `search`, `getNode`, `getNodeBySource`, `getNodeEdges`, `traverse`, `getContext`, `getTopics`, `getStats`, `ingest`, `expand`, `createLink`, `createNode`, `getTraversalLogs`, `getTraversalLog`, `getSenders`, `listConversations` |

## ApiRequest Structure

```typescript
interface ApiRequest<TSchema extends RouteSchema> {
  params: InferParams<TSchema>;
  query: InferQuery<TSchema>;
  body: InferBody<TSchema>;
  requestId: string;
}
```

`requestId` is always a UUID string injected by the server middleware — use it for logging correlation.

## ApiResponse Union

```typescript
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
```

Controllers return `ApiResponse`. The server serializes `ok: true` → 201/200 and `ok: false` → `statusHint` HTTP status.
