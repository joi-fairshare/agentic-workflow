# CLAUDE.md — agentic-workflow

> Portable Claude Code workflow toolkit: custom skills, config archive, repo bootstrapper, and a bidirectional MCP bridge for multi-agent communication.

## Required Context

Read before making changes:

| Document | Purpose |
|----------|---------|
| `planning/ARCHITECTURE.md` | System components and data flow |
| `planning/API_CONTRACT.md` | MCP bridge REST & tool schemas |
| `planning/CODE_STYLE.md` | TypeScript conventions and patterns |
| `planning/TESTING.md` | Test strategy and coverage targets |
| `planning/ERD.md` | SQLite schema and relationships |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js >= 20, ES2022 target |
| Language | TypeScript 5.7, strict mode |
| HTTP | Fastify 5 |
| Database | SQLite via better-sqlite3, WAL mode |
| MCP | @modelcontextprotocol/sdk (stdio transport) |
| Validation | Zod 3 |
| Test | Vitest (in-memory SQLite) |
| Build | tsc (ESM, Node16 module resolution) |

## Architecture

```
agentic-workflow/
├── skills/                    # Claude Code custom skills (symlinked to ~/.claude/skills/)
│   ├── review/                # Multi-agent PR review orchestrator
│   ├── postReview/            # GitHub comment publisher
│   ├── addressReview/         # Review fix implementer
│   └── enhancePrompt/         # Context-aware prompt rewriter
├── bootstrap/                 # Repo documentation generator skill
├── config/                    # Settings & MCP config archive
├── mcp-bridge/                # MCP bridge application
│   └── src/
│       ├── application/       # AppResult<T> pattern, service functions (never throw)
│       │   ├── result.ts      # ok<T>(), err<T>(), AppError, AppResult<T>
│       │   └── services/      # Business logic — pure functions taking DbClient
│       ├── db/                # SQLite schema, client interface, transactions
│       │   ├── schema.ts      # MIGRATIONS constant, createDatabase()
│       │   └── client.ts      # DbClient interface (prepared statements, no SQL injection)
│       ├── transport/         # Typed router, Zod schemas, controllers
│       │   ├── types.ts       # RouteSchema, defineRoute<TSchema>()
│       │   └── schemas/       # Zod schemas for messages and tasks
│       ├── routes/            # Route factories (wire schemas → handlers)
│       ├── server.ts          # Fastify server factory
│       ├── mcp.ts             # MCP stdio server (5 tools)
│       └── index.ts           # REST API entry point
├── planning/                  # Generated project documentation
└── setup.sh                   # One-command setup script
```

## Key Patterns

### AppResult\<T\> — Services never throw

```typescript
import { ok, err, type AppResult } from "./application/result.js";

function myService(db: DbClient, input: Input): AppResult<Output> {
  if (invalid) return err({ code: "VALIDATION", message: "...", statusHint: 400 });
  return ok(result);
}
```

### Typed Router — Compile-time schema ↔ handler linking

```typescript
import { defineRoute, type RouteSchema } from "./transport/types.js";

const MySchema = { body: z.object({...}), response: z.object({...}) } satisfies RouteSchema;
export const myRoute = defineRoute<typeof MySchema>({ method: "POST", url: "/path", schema: MySchema, handler: ... });
```

### Transactions — Atomic multi-step operations

```typescript
const result = db.transaction(() => {
  db.insertMessage(msg);
  db.updateTaskStatus(taskId, status);
  return { message: msg, task_updated: true };
});
```

## Code Style

- **ESM only** — all imports use `.js` extensions
- **No classes** — factory functions and closures
- **No exceptions in business logic** — AppResult everywhere
- **Zod for all external input** — request bodies, env vars, MCP tool args
- **Prepared statements only** — never interpolate SQL

## Commands

```bash
# MCP Bridge
cd mcp-bridge
npm run build          # TypeScript → dist/
npm run dev            # Dev server with tsx
npm start              # Production server (Fastify on :3100)
npm test               # Vitest (all tests, in-memory SQLite)
npm run test:watch     # Vitest watch mode
npm run typecheck      # tsc --noEmit

# Setup (from repo root)
./setup.sh             # Symlink skills, copy config, install deps
```

## Merge Gate

Before merging any PR:
1. `npm run typecheck` passes with zero errors
2. `npm test` passes with all tests green
3. No `any` types outside of Fastify integration boundaries

## Commit Conventions

Format: `type: short description`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

Keep commits atomic — one logical change per commit. See `planning/COMMIT_STRATEGY.md` for details.
