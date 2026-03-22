# CLAUDE.md — agentic-workflow

> Portable Claude Code workflow toolkit: 21 custom skills, config archive, repo bootstrapper, a bidirectional MCP bridge for multi-agent communication, and a conversation memory system with graph-based retrieval.

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
| HTTP (bridge) | Fastify 5 |
| HTTP (UI) | Next.js 15 App Router |
| Database | SQLite via better-sqlite3, WAL mode |
| Vector search | sqlite-vec (KNN over node embeddings) |
| Embeddings | @xenova/transformers (768-dim, lazy-loaded) |
| MCP | @modelcontextprotocol/sdk (stdio transport) |
| Validation | Zod 3 |
| Test | Vitest (in-memory SQLite; happy-dom for UI hooks) |
| Build | tsc (ESM, Node16 module resolution) |

## Skills (21)

All skills are slash commands invoked inside Claude Code sessions. They are installed by symlinking into `~/.claude/skills/`.

| Skill | Purpose | Output Dir |
|-------|---------|------------|
| `/review` | Multi-agent PR code review | `reviews/` |
| `/postReview` | Publish review findings to GitHub | `reviews/` |
| `/addressReview` | Implement review fixes in parallel | `reviews/` |
| `/enhancePrompt` | Context-aware prompt rewriter | — |
| `/bootstrap` | Generate repo planning docs + CLAUDE.md | — |
| `/rootCause` | 4-phase systematic debugging | `investigations/` |
| `/bugHunt` | Fix-and-verify loop with regression tests | `qa/` |
| `/bugReport` | Structured bug report with health scores | `qa/` |
| `/shipRelease` | Sync, test, push, open PR | `releases/` |
| `/syncDocs` | Post-ship doc updater | `releases/` |
| `/weeklyRetro` | Weekly retrospective with shipping streaks | `retros/` |
| `/officeHours` | YC-style brainstorming → design doc | `plans/` |
| `/productReview` | Founder/product lens plan review | `plans/` |
| `/archReview` | Engineering architecture plan review | `plans/` |
| `/design-analyze` | Extract design tokens from reference sites | `design/` |
| `/design-language` | Define brand personality and aesthetic direction | — |
| `/design-evolve` | Merge new reference into design language | — |
| `/design-mockup` | Generate HTML mockup from design language | `design/` |
| `/design-implement` | Generate production code from mockup | — |
| `/design-refine` | Dispatch Impeccable refinement commands | — |
| `/design-verify` | Screenshot diff implementation vs mockup | `design/` |

### Skill Pipeline

```
officeHours → productReview / archReview
    → design-analyze → design-language → design-mockup → design-implement → design-refine → design-verify
                                       ^
                              design-evolve (anytime)
    → review → rootCause → bugHunt → shipRelease → syncDocs → weeklyRetro
```

Skills are designed to flow into each other. Each skill writes outputs that downstream skills auto-discover.

### Centralized Output Directory

All skill outputs are written to `~/.agentic-workflow/<repo-slug>/` with subdirectories:

```
~/.agentic-workflow/<repo-slug>/
├── design/           # /design-mockup, /design-verify baselines and diffs
├── reviews/          # /review, /postReview, /addressReview state files
├── investigations/   # /rootCause investigation reports
├── qa/               # /bugHunt and /bugReport reports
├── plans/            # /officeHours, /productReview, /archReview design docs
├── releases/         # /shipRelease and /syncDocs reports
└── retros/           # /weeklyRetro retrospectives
```

The repo slug is derived from `git remote get-url origin` (fallback: directory name).

## Architecture

```
agentic-workflow/
├── skills/                    # Claude Code custom skills (symlinked to ~/.claude/skills/)
│   ├── review/                # /review — multi-agent PR review orchestrator
│   │   ├── SKILL.md           #   skill manifest + 7-step orchestration flow
│   │   ├── triage-prompt.md   #   subagent prompt: classify files → reviewer agents
│   │   └── reviewer-prompt.md #   subagent prompt: domain-specific code review
│   ├── postReview/            # /postReview — publish findings to GitHub
│   ├── addressReview/         # /addressReview — implement review fixes
│   │   ├── SKILL.md           #   orchestrator: triage → parallel implementers
│   │   ├── address-triage-prompt.md
│   │   └── implementer-prompt.md
│   ├── enhancePrompt/         # /enhancePrompt — context-aware prompt rewriter
│   ├── rootCause/             # /rootCause — 4-phase systematic debugging
│   ├── bugHunt/               # /bugHunt — fix-and-verify loop
│   ├── bugReport/             # /bugReport — read-only health audit
│   ├── shipRelease/           # /shipRelease — sync, test, push, PR
│   ├── syncDocs/              # /syncDocs — post-ship doc updater
│   ├── weeklyRetro/           # /weeklyRetro — weekly retrospective
│   ├── officeHours/           # /officeHours — YC-style brainstorming
│   ├── productReview/         # /productReview — founder/product lens review
│   ├── archReview/            # /archReview — engineering architecture review
│   ├── design-analyze/        # /design-analyze — extract design tokens
│   ├── design-language/       # /design-language — define brand personality
│   ├── design-evolve/         # /design-evolve — merge new reference
│   ├── design-mockup/         # /design-mockup — generate HTML mockup
│   ├── design-implement/      # /design-implement — generate production code
│   ├── design-refine/         # /design-refine — dispatch Impeccable commands
│   ├── design-verify/         # /design-verify — screenshot diff verification
│   ├── _preamble.md           # Shared preamble reference (not a skill)
│   └── _design-preamble.md    # Shared design context preamble (not a skill)
├── bootstrap/                 # /bootstrap — repo documentation generator
├── config/                    # Settings, MCP config, and statusline script
│   ├── settings.json          #   Claude Code settings (statusLine + Stop/PreToolUse hooks)
│   └── statusline.sh          #   Adaptive statusline — 5 width tiers (installed to ~/.claude/)
├── mcp-bridge/                # MCP bridge application
│   ├── src/
│   │   ├── application/       # AppResult<T> pattern, service functions (never throw)
│   │   │   ├── result.ts      # ok<T>(), err<T>(), AppError, AppResult<T>
│   │   │   ├── events.ts      # EventBus factory — pub/sub (message:created, task:created, task:updated)
│   │   │   └── services/      # Business logic — pure functions taking DbClient or MemoryDbClient
│   │   │       ├── search-memory.ts    # Hybrid search (FTS5 + KNN + RRF fusion)
│   │   │       ├── traverse-memory.ts  # BFS graph traversal with direction/depth/kind filters
│   │   │       ├── assemble-context.ts # Token-budgeted context assembly
│   │   │       ├── ingest-bridge.ts    # Bridge message → memory node pipeline
│   │   │       ├── ingest-git.ts       # Git metadata (commits, PRs) ingestion
│   │   │       ├── ingest-transcript.ts # JSONL transcript ingestion
│   │   │       ├── extract-decisions.ts # Decision extraction via regex heuristics
│   │   │       └── infer-topics.ts     # Topic inference via embedding clustering (k-means++)
│   │   ├── ingestion/         # Shared ingestion infrastructure
│   │   │   ├── embedding.ts   # EmbeddingService — lazy-loaded @xenova/transformers (768-dim)
│   │   │   ├── queue.ts       # BoundedQueue<T> — bounded async queue with backpressure
│   │   │   ├── secret-filter.ts # Regex-based secret detection and redaction
│   │   │   └── transcript-parser.ts # JSONL transcript parser
│   │   ├── db/                # SQLite schema, client interface, transactions
│   │   │   ├── schema.ts      # MIGRATIONS constant, createDatabase()
│   │   │   ├── client.ts      # DbClient interface (prepared statements, no SQL injection)
│   │   │   ├── memory-schema.ts # Memory graph DDL: nodes, edges, FTS5, sqlite-vec
│   │   │   └── memory-client.ts # MemoryDbClient interface for graph operations
│   │   ├── transport/         # Typed router, Zod schemas, controllers
│   │   │   ├── types.ts       # RouteSchema, defineRoute<TSchema>()
│   │   │   ├── schemas/       # Zod schemas for messages, tasks, conversations, and memory
│   │   │   └── controllers/   # Controller factories (message, task, conversation, memory)
│   │   ├── routes/            # Route factories (wire schemas → handlers)
│   │   │   ├── messages.ts    # POST /messages/send, GET /messages/conversation/:id, GET /messages/unread
│   │   │   ├── tasks.ts       # POST /tasks/assign, GET /tasks/:id, GET /tasks/conversation/:id, POST /tasks/report
│   │   │   ├── conversations.ts # GET /conversations
│   │   │   ├── events.ts      # GET /events (SSE, heartbeat every 30s)
│   │   │   └── memory.ts      # 10 memory routes: search, node, edges, traverse, context, topics, stats, ingest, link, create
│   │   ├── server.ts          # Fastify server factory
│   │   ├── mcp.ts             # MCP stdio server (10 tools: 5 bridge + 5 memory)
│   │   └── index.ts           # REST API entry point (creates EventBus, memory system, ingestion queue)
│   ├── tests/                 # Vitest test suite (mirrors src/ structure)
│   │   ├── routes/            # Route integration tests (messages, tasks, conversations, events, memory)
│   │   └── *.test.ts          # Unit tests for controllers, services, db, ingestion, MCP tools
│   └── vitest.config.ts       # Coverage config: v8, no thresholds, excludes index.ts + mcp.ts
├── ui/                        # Next.js 15 App Router conversation dashboard
│   ├── src/
│   │   ├── app/               # Pages: / (conversations), /conversation/[id], /memory (explorer)
│   │   ├── components/        # Timeline, DiagramRenderer, CopyButton, MemoryGraph
│   │   ├── hooks/             # use-sse, use-memory-search, use-memory-traverse, use-context-assembler
│   │   └── lib/               # api.ts, memory-api.ts, diagrams.ts, types.ts
│   ├── __tests__/             # Vitest test suite (happy-dom environment)
│   │   ├── hooks/             # Hook tests (use-sse, use-memory-search, use-memory-traverse, use-context-assembler)
│   │   ├── lib/               # Lib tests (api, memory-api, diagrams)
│   │   └── setup.ts           # Global test setup
│   └── vitest.config.ts       # Coverage config: v8, no thresholds, covers hooks/ + lib/ (excl. types.ts)
├── planning/                  # Generated project documentation
├── start.sh                   # Start bridge + UI together
└── setup.sh                   # One-command setup: skills, statusline, shell-integration, config, bridge, UI
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

### EventBus — In-process pub/sub for SSE

```typescript
import { createEventBus, type BridgeEvent } from "./application/events.js";

const bus = createEventBus();
bus.on("message:created", (event) => sseClients.forEach(c => c.send(event)));
bus.emit({ type: "message:created", data: message });
```

Event types: `message:created`, `task:created`, `task:updated`. The EventBus is created once in `index.ts` and passed into controller factories. SSE clients subscribe via `GET /events`.

### BoundedQueue\<T\> — Backpressure-aware async ingestion

```typescript
import { createBoundedQueue } from "./ingestion/queue.js";

const queue = createBoundedQueue<Event>({
  maxSize: 500,
  handler: async (event) => { /* process */ },
  onDrop: (event) => { /* log dropped item */ },
  onError: (err) => { /* log error */ },
});
queue.enqueue(event); // drops oldest if full
```

The ingestion queue decouples the EventBus from the memory pipeline. Bridge messages are enqueued on `message:created` and processed asynchronously through secret filtering, embedding, and node creation.

### Hybrid Search — FTS5 + KNN + RRF fusion

Memory search supports three modes: `keyword` (FTS5 full-text), `semantic` (sqlite-vec KNN), and `hybrid` (Reciprocal Rank Fusion of both). The `searchMemory` service takes a `MemoryDbClient` + `EmbeddingService` and returns scored results.

### Memory Graph — Dual-database architecture

The memory system uses a separate SQLite database (`memory.db`) from the bridge database. `MemoryDbClient` mirrors the `DbClient` pattern with prepared statements for graph operations (nodes, edges, FTS5 index, vector embeddings). Both databases use WAL mode.

## Design Language

| File | Purpose |
|------|---------|
| `planning/DESIGN_SYSTEM.md` | Design principles, component catalog, strategic decisions |
| `.impeccable.md` | Brand personality + aesthetic direction (AI context) |
| `design-tokens.json` | W3C DTCG tokens (colors, typography, spacing) |

Run `/design-analyze <url>` to extract tokens from reference sites.
Run `/design-language` to define brand context.

### Design Pipeline

```
/design-analyze → /design-language → /design-mockup → /design-implement → /design-refine → /design-verify
                                   ^
                          /design-evolve (anytime)
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
npm run test:coverage  # Run with 100% coverage enforcement
npm run typecheck      # tsc --noEmit

# UI Dashboard
cd ui
npm run dev            # Next.js dev server (http://localhost:3000)
npm run build          # Production build
npm start              # Production server
npm test               # Vitest (hooks + lib tests)
npm run test:coverage  # Run with 100% coverage enforcement

# Setup (from repo root)
./setup.sh             # Symlink skills, copy config, install statusline, install deps, build bridge, create output dir
./start.sh             # Start bridge (:3100) + UI (:3000) together
```

## Merge Gate

Before merging any PR:
1. `npm run typecheck` passes with zero errors
2. `npm test` passes with all tests green (293 bridge + 61 UI)
3. No `/* v8 ignore */` annotations in source files (prohibited — write the test instead)
4. No `any` types outside of Fastify integration boundaries

## Commit Conventions

Format: `type: short description`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

Keep commits atomic — one logical change per commit. See `planning/COMMIT_STRATEGY.md` for details.
