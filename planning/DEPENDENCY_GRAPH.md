# Dependency Graph

## Runtime Environment

| Requirement | Value |
|-------------|-------|
| Node.js | >= 20 |
| TypeScript target | ES2022 |
| Module system | Node16 (ESM — `"type": "module"` in package.json) |
| Module resolution | Node16 |
| Strict mode | Enabled |

## Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | ^1.12.1 | MCP server implementation — provides `McpServer` class and `StdioServerTransport` for exposing tools over the MCP stdio protocol |
| `better-sqlite3` | ^11.7.0 | Synchronous SQLite3 driver — used for the store-and-forward message queue and task persistence with WAL journal mode |
| `fastify` | ^5.2.1 | HTTP framework — serves the REST API on port 3100 with built-in logging; used only as a listener/router, no plugins or middleware |
| `zod` | ^3.24.2 | Schema validation — defines input/output shapes for both MCP tool parameters and REST API request bodies, params, and querystrings |

## Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@types/better-sqlite3` | ^7.6.12 | TypeScript type definitions for better-sqlite3 |
| `@types/node` | ^22.10.0 | TypeScript type definitions for Node.js built-in modules |
| `tsx` | ^4.19.0 | TypeScript execution engine — runs `.ts` files directly for `npm run dev` without a build step |
| `typescript` | ^5.7.0 | TypeScript compiler — targets ES2022, emits declarations and source maps |
| `vitest` | ^2.1.9 | Test runner — configured for `vitest run` (single pass) and `vitest` (watch mode) |

## No Framework Lock-in

The project uses Fastify as a thin HTTP listener but does not depend on Fastify-specific features such as plugins, decorators, hooks, or serialization. The custom router in `server.ts` registers routes via a generic `ControllerDefinition` interface and performs Zod validation manually rather than using Fastify's schema validation. This means the HTTP layer could be swapped for any framework (Express, Hono, bare `node:http`) by reimplementing the ~90-line `createServer` function without touching application or domain logic.

## Layer Dependency Map

```
Entry Points
├── index.ts (REST API)
│   ├── db/schema.ts .............. createDatabase()
│   ├── db/client.ts .............. createDbClient()
│   ├── routes/messages.ts ........ createMessageRoutes()
│   ├── routes/tasks.ts ........... createTaskRoutes()
│   └── server.ts ................. createServer()
│
└── mcp.ts (MCP stdio server)
    ├── db/schema.ts .............. createDatabase()
    ├── db/client.ts .............. createDbClient()
    └── application/services/*.ts .. service functions directly

Routes Layer (routes/)
├── routes/messages.ts
│   ├── transport/controllers/message-controller.ts
│   ├── transport/types.ts ........ defineRoute, ControllerDefinition
│   └── transport/schemas/message-schemas.ts
│
└── routes/tasks.ts
    ├── transport/controllers/task-controller.ts
    ├── transport/types.ts ........ defineRoute, ControllerDefinition
    └── transport/schemas/task-schemas.ts

Transport Layer (transport/)
├── controllers/message-controller.ts
│   ├── application/services/send-context.ts
│   ├── application/services/get-messages.ts
│   └── transport/types.ts ........ ApiRequest, ApiResponse, appErr
│
├── controllers/task-controller.ts
│   ├── application/services/assign-task.ts
│   ├── application/services/report-status.ts
│   ├── application/result.ts ..... ERROR_CODE
│   └── transport/types.ts ........ ApiRequest, ApiResponse, appErr
│
├── types.ts ...................... RouteSchema, RouteEntry, ControllerDefinition
│   └── zod (external) ........... ZodType
│
└── schemas/ ...................... Zod schema definitions (no internal deps)

Application Layer (application/)
├── result.ts ..................... AppResult<T>, ok(), err(), ERROR_CODE
│
├── services/send-context.ts
│   ├── db/client.ts .............. DbClient type
│   └── application/result.ts ..... AppResult, ok
│
├── services/get-messages.ts
│   ├── db/client.ts .............. DbClient type
│   └── application/result.ts ..... AppResult, ok
│
├── services/assign-task.ts
│   ├── db/client.ts .............. DbClient type
│   └── application/result.ts ..... AppResult, ok
│
└── services/report-status.ts
    ├── db/client.ts .............. DbClient type
    └── application/result.ts ..... AppResult, ok, err, ERROR_CODE

Database Layer (db/)
├── schema.ts ..................... createDatabase(), MIGRATIONS SQL
│   └── better-sqlite3 (external)
│
└── client.ts ..................... DbClient interface, createDbClient()
    ├── better-sqlite3 (external) . Database type
    └── node:crypto ............... randomUUID()
```

## Dependency Direction

Dependencies flow strictly downward:

```
  Entry Points (index.ts, mcp.ts)
         │
    Routes Layer (routes/)
         │
   Transport Layer (transport/)
         │
  Application Layer (application/)
         │
    Database Layer (db/)
         │
   External Packages + Node built-ins
```

No circular dependencies exist. The application layer never imports from the transport or routes layers. The database layer never imports from any layer above it. The MCP entry point bypasses the routes/transport layers entirely and calls service functions directly, which is why both transports (REST and MCP stdio) can coexist without coupling.

## External System Dependencies

| System | Binding | Required By |
|--------|---------|-------------|
| SQLite (via better-sqlite3) | File-based, default `./bridge.db` | MCP bridge data persistence |
| GitHub CLI (`gh`) | Shell command | Skills (review, postReview, addressReview) |
| Claude Code | CLI tool | Skills execution, MCP server registration |
| Node.js native modules | `node:crypto` (randomUUID), `node:path` (join) | db/client.ts, db/schema.ts |
