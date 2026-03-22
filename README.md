# Agentic Workflow

A portable Claude Code workflow toolkit: custom skills, configuration archive, repo bootstrapper, and a bidirectional MCP bridge for multi-agent communication.

## Prerequisites

- Node.js >= 20
- [Claude Code](https://claude.com/claude-code) installed
- [GitHub CLI (`gh`)](https://cli.github.com/) installed and authenticated (required by review skills)
- [`jq`](https://jqlang.github.io/jq/) installed (required by the statusline; `brew install jq` on macOS)

## Contents

### 1. Skills & Config Archive

Extracted from `~/.claude/` for replication on any machine.

| Skill | Purpose |
|-------|---------|
| `/review` | Multi-agent PR code review orchestrator |
| `/postReview` | Publish review findings to GitHub as batched comments |
| `/addressReview` | Implement review fixes with parallel agents |
| `/enhancePrompt` | Context-aware prompt rewriter |
| `/bootstrap` | Repo documentation generator (see below) |
| `/rootCause` | 4-phase systematic debugging |
| `/bugHunt` | Fix-and-verify loop with regression tests |
| `/bugReport` | Structured bug report with health scores |
| `/shipRelease` | Sync, test, push, open PR |
| `/syncDocs` | Post-ship doc updater |
| `/weeklyRetro` | Weekly retrospective with shipping streaks |
| `/officeHours` | YC-style brainstorming → design doc |
| `/productReview` | Founder/product lens plan review |
| `/archReview` | Engineering architecture plan review |
| `/design-analyze` | Extract design tokens from reference sites |
| `/design-language` | Define brand personality and aesthetic direction |
| `/design-evolve` | Merge new reference into design language |
| `/design-mockup` | Generate HTML mockup from design language |
| `/design-implement` | Generate production code from mockup |
| `/design-refine` | Dispatch Impeccable refinement commands |
| `/design-verify` | Screenshot diff implementation vs mockup |

**Config files:** `config/settings.json`, `config/mcp.json`, `config/statusline.sh`

### 2. Statusline

`config/statusline.sh` is an adaptive two-line statusline for Claude Code sessions. It is installed to `~/.claude/statusline.sh` and wired into `settings.json` automatically by `setup.sh`.

**Columns (left → right, highest priority leftmost):**

| Column | Description |
|--------|-------------|
| 5h Usage | 5-hour rate-limit percentage + reset time |
| 7d Usage | 7-day rate-limit percentage + reset day |
| Context | Color-coded bar + percentage of context window used |
| Model | Active model name (trimmed) |
| Branch | Current git branch |
| Cost | Session cost in USD |
| Time | Session duration |
| Cache | Cache read hit rate |
| API | API wait percentage |
| Lines | Lines added/removed |

**Adaptive width tiers** — columns drop automatically as the terminal narrows:

| Tier | Min width | Columns shown |
|------|-----------|---------------|
| FULL | 116 cols | All columns, branch up to 15 chars |
| MEDIUM | 101 cols | No Lines; branch up to 12 chars |
| NARROW | 78 cols | No Lines/Cache/API; 7d % only; narrow context bar |
| COMPACT | 65 cols | 5h % only; narrow context bar; branch up to 10 chars |
| COMPACT-S | < 65 cols | Same as COMPACT but drops Time column |

Terminal width is read from `~/.claude/terminal_width` (written by the shell integration on every prompt and on `SIGWINCH`), which is the only reliable source because Claude Code runs the statusline in a subprocess where `/dev/tty` is inaccessible and `$COLUMNS` is 0.

**Shell integration** is installed by `setup.sh` to `~/.claude/shell-integration.sh` and sourced from `~/.zshrc` / `~/.bashrc`. It keeps `~/.claude/terminal_width` current and writes `~/.claude/shell_pid` so resize events propagate mid-session via `SIGWINCH`.

### 3. Bootstrap Skill

Invocable via `/bootstrap` in any repo. Orchestrates documentation generation:

- Detects which of 17 Pivot-pattern docs exist (BUSINESS_PLAN, ARCHITECTURE, ERD, etc.)
- Generates missing docs adapted to the target repo's tech stack
- Creates a CLAUDE.md if none exists
- Handles bare repos, partially documented repos, and well-documented repos

### 4. MCP Bridge (Claude Code / Codex)

A TypeScript MCP server for bidirectional multi-agent communication.

**MCP Tools (messaging):**
- `send_context` — Send task context + meta-prompt between agents
- `get_messages` — Retrieve conversation history by UUID
- `get_unread` — Check for unread messages (marks as read on retrieval)
- `assign_task` — Assign tasks with domain and implementation details
- `report_status` — Report back with feedback or completion

**MCP Tools (memory):**
- `search_memory` — Hybrid FTS5 + vector search across the knowledge graph
- `traverse_memory` — BFS graph traversal with direction/depth/kind filters
- `get_context` — Token-budgeted context assembly from memory for an agent
- `create_memory_link` — Create an edge between two memory nodes
- `create_memory_node` — Create a topic or decision node in memory

**API Endpoints (messaging):**
- `POST /messages/send` — Send context between agents
- `GET /messages/conversation/:id` — Retrieve conversation history
- `GET /messages/unread?recipient=` — Fetch and mark-read unread messages
- `POST /tasks/assign` — Assign a task with domain classification
- `GET /tasks/:id` — Get a task by ID
- `GET /tasks/conversation/:id` — Get all tasks for a conversation
- `POST /tasks/report` — Report task status
- `GET /conversations` — Paginated conversation summaries
- `GET /events` — SSE stream (`message:created`, `task:created`, `task:updated`, heartbeat every 30s)

**API Endpoints (memory):**
- `GET /memory/search` — Search nodes by keyword, semantic, or hybrid query
- `GET /memory/node/:id` — Get a memory node by ID
- `GET /memory/node/:id/edges` — Get all edges for a node
- `GET /memory/traverse/:id` — BFS graph traversal from a node
- `GET /memory/context` — Assemble token-budgeted context for a query or node
- `GET /memory/topics` — List topic nodes for a repo
- `GET /memory/stats` — Memory graph statistics for a repo
- `POST /memory/ingest` — Ingest data from a source (bridge, git, transcript)
- `POST /memory/link` — Create an edge between two nodes
- `POST /memory/node` — Create a new memory node

**Features:**
- SQLite store-and-forward (messages queue when recipient is offline)
- Conversation continuity via UUID
- Fastify REST API (port 3100) + MCP stdio server
- Full end-to-end type safety with `AppResult<T>` pattern
- Atomic transactions for multi-step operations
- EventBus for real-time SSE push to connected clients
- CORS enabled for local UI integration
- Knowledge graph with nodes, edges, FTS5 full-text search, and sqlite-vec embeddings
- Ingestion pipeline: bridge messages, git metadata (commits/PRs), JSONL transcripts
- Automatic topic inference via embedding clustering and decision extraction via regex heuristics
- Secret filtering with regex-based redaction for API keys, tokens, and passwords
- Bounded async queue for background ingestion with overflow drop

### 5. Conversation Dashboard (UI)

A Next.js 15 App Router web UI for visualising bridge activity in real time.

**Features:**
- Paginated conversation list with UUID filter and SSE live updates
- Per-conversation detail view: chronological timeline, directed graph, sequence diagram
- Mermaid-powered diagrams built from live message + task data
- Memory Explorer page (`/memory`) with search, graph traversal, context assembly, and interactive MemoryGraph visualisation
- Reverse-proxies `/api/*` to the bridge REST API (`:3100`)

**Run the dashboard:**
```bash
cd ui
npm run dev    # http://localhost:3000
```

## Setup

```bash
git clone https://github.com/joi-fairshare/agentic-workflow.git ~/repos/agentic-workflow
cd ~/repos/agentic-workflow
./setup.sh
```

The setup script:
- Checks for `jq` (hard prerequisite — aborts with install instructions if missing)
- Symlinks skills into `~/.claude/skills/`
- Copies config files (settings, MCP)
- Installs the statusline to `~/.claude/statusline.sh` and wires `statusLine` into `settings.json`
- Installs shell integration to `~/.claude/shell-integration.sh` and sources it from `~/.zshrc` / `~/.bashrc` for terminal width sync
- Installs and builds the MCP bridge
- Installs UI dependencies
- Registers `agentic-bridge` MCP server with Claude Code and Codex
- Adds plugin marketplaces and installs plugins (github, superpowers, compound-engineering, playwright)

### Start the bridge + UI

```bash
./start.sh         # Bridge on :3100, UI on :3000
```

Or run them individually:

```bash
cd mcp-bridge && npm start    # Fastify on http://127.0.0.1:3100
cd ui && npm run dev          # Next.js on http://localhost:3000
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | REST API port |
| `HOST` | `127.0.0.1` | Bind address (loopback only by default) |
| `DB_PATH` | `./bridge.db` | SQLite database file path |
| `ALLOW_REMOTE` | unset | Set to `1` to allow non-loopback binding |

## Testing

Both packages enforce 100% coverage on all thresholds (statements, branches, functions, lines).

```bash
# MCP Bridge (Vitest, in-memory SQLite)
cd mcp-bridge
npm test                  # Run all tests (293 tests)
npm run test:watch        # Watch mode
npm run test:coverage     # Enforce 100% coverage thresholds

# UI (Vitest + happy-dom)
cd ui
npm test                  # Run all tests (61 tests)
npm run test:coverage     # Enforce 100% coverage thresholds
```

Test coverage spans unit tests (controllers, services, DB client, schemas, utilities), integration tests (all REST routes via Fastify inject, SSE stream, MCP tool handlers), and hook/lib tests for the UI layer.

## Architecture

```
agentic-workflow/
├── skills/                    # Claude Code custom skills
│   ├── review/                # Multi-agent PR review
│   ├── postReview/            # GitHub comment publisher
│   ├── addressReview/         # Review fix implementer
│   └── enhancePrompt/         # Context-aware prompt rewriter
├── bootstrap/                 # Repo documentation generator skill
├── config/                    # Settings, MCP config archive, statusline script
├── mcp-bridge/                # MCP bridge application
│   ├── src/
│   │   ├── application/       # AppResult<T>, EventBus, services (never throw)
│   │   ├── db/                # SQLite schema, client interface, transactions
│   │   │                      #   + memory-schema.ts, memory-client.ts (knowledge graph)
│   │   ├── ingestion/         # Embedding service, async queue, secret filter, transcript parser
│   │   ├── transport/         # Typed router, Zod schemas, controllers
│   │   ├── routes/            # Route factories (messages, tasks, conversations, memory, events)
│   │   ├── server.ts          # Fastify server factory
│   │   ├── mcp.ts             # MCP stdio server (10 tools: 5 messaging + 5 memory)
│   │   └── index.ts           # REST API entry point
│   └── tests/                 # Vitest suite — unit + integration, 100% coverage
├── ui/                        # Next.js 15 conversation dashboard
│   └── src/
│       ├── app/               # App Router pages (conversations, detail, memory explorer)
│       ├── components/        # Timeline, DiagramRenderer, CopyButton, MemoryGraph
│       ├── hooks/             # use-sse, use-memory-search, use-memory-traverse, use-context-assembler
│       └── lib/               # API client, Mermaid builders, shared types
├── start.sh                   # Start bridge + UI together
└── setup.sh                   # One-command setup script
```
