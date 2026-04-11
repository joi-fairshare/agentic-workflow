# Agentic Workflow

A portable Claude Code workflow toolkit: custom skills, configuration archive, repo bootstrapper, a bidirectional MCP bridge for multi-agent communication, and token-efficiency tools (rtk command rewriter, headroom context compressor).

## Workflow: Product Vision → Ship

This toolkit supports an end-to-end product workflow where **AI sessions replace documents** — the goal is GitHub issues as the single source of truth, not a proliferating collection of local markdown files.

### Stage 1 — Ideation

```
/withInterview
```

**Human in the loop:** You're in the hot seat. The agent interviews you — asking questions, challenging assumptions, surfacing contradictions — while you answer in your own words. The output is a coherent problem statement and set of goals distilled from your raw thinking, not polished prose you had to write yourself.

### Stage 2 — Spec & Design Doc

```
/officeHours [feature or problem]
```

**Human in the loop:** This is a back-and-forth collaboration. The agent proposes requirements, you push back. It drafts the technical design, you redirect priorities and flag constraints it doesn't know about. Think of it as a YC office hours session — you leave with decisions made, not just options listed. It also brings structure to multi-team collaboration: product and engineering can align on vision, scope, and trade-offs in a shared session before anyone writes a line of code. The output lands in `~/.agentic-workflow/<repo>/plans/`:

| File | Owner | Contents |
|------|-------|----------|
| `product.md` | Product | Problem statement, EARS requirements, acceptance criteria, success metrics, MVP scope |
| `engineering.md` | Engineering | Current state, approach, architecture decisions, open questions |
| `design-brief.md` | Design | Experience goals, key interactions, UX requirements, design language reference |
| `TASKS.md` | Engineering | Atomic task breakdown with `domain` tags — cross-team visibility |

Each file is a standalone artifact. Everyone leaves the session with a doc they own, not a monolith no one does.

Optionally pressure-test the outputs before moving on:

```
/productReview    # Founder/product lens: is this the right thing to build?
/archReview       # Engineering lens: is this the right way to build it?
```

### Stage 3 — Design System & Mockups

```
/design-analyze   # Extract design tokens from reference sites (web or iOS)
/design-language  # Define brand personality and aesthetic direction
/design-mockup    # Generate HTML or SwiftUI mockup from design language
/design-refine    # Agents self-critique and iterate against the design language
```

**Human in the loop:** After the initial mockup is generated, agents enter a self-critique loop — evaluating whether the mockup faithfully reflects the established design language, identifying deviations, and refining autonomously. You step in at natural breakpoints: reviewing the current state, directing emphasis ("make the data table the focus, not the sidebar"), and deciding when the visual spec is ready to lock. You're the final arbiter of "good enough to build from," not a participant in every pixel decision.

These produce `design-tokens.json`, `.impeccable.md`, and a `mockup.html` (or SwiftUI file) that serve as the visual specification.

### Stage 4 — Engineering Roadmap (GitHub Issues)

Create a **multi-phase issue hierarchy** directly from the officeHours output:

1. **Epic issue** — paste the product vision, `product.md`, and the `engineering.md` approach section
2. **Task issues** — one per entry in `TASKS.md`, each referencing the epic and embedding relevant context
3. **Attach mockups** — link or embed the mockup screenshot so the visual spec lives in the issue

The officeHours MD files are **ephemeral** — once context is in GitHub issues, delete or ignore them. The issues become the canonical source of truth: product vision + design language reference + mockups all in one place, no local file sprawl.

### Stage 5 — Ship

```
/review           # Multi-agent PR code review
/postReview       # Publish findings to GitHub as batched comments
/addressReview    # Implement fixes with parallel agents
/shipRelease      # Sync, test, push, open PR
/syncDocs         # Post-ship doc updater
/weeklyRetro      # Retrospective with shipping streaks
```

**Human in the loop:** Shipping is a loop, not a one-shot. The review agents surface issues and publish them to GitHub. You decide what to address before merge and what can be tracked as follow-ups. `/addressReview` implements the fixes in parallel; you review the diff. `/shipRelease` runs the gate checks — you approve the PR. The retro closes the loop: what shipped, what slipped, what to carry into next week.

---

## Prerequisites

- Node.js >= 20
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running (required for Serena LSP)
- [Claude Code](https://claude.com/claude-code) installed
- [GitHub CLI (`gh`)](https://cli.github.com/) installed and authenticated (required by review skills)
- [`jq`](https://jqlang.github.io/jq/) installed (required by the statusline; `brew install jq` on macOS)
- [`rtk`](https://github.com/rtk-ai/rtk) — token-compressing CLI proxy (`brew install rtk` on macOS; installed automatically by `setup.sh`)
- Python 3 + pip — required for headroom
- [`headroom`](https://github.com/chopratejas/headroom) — context optimization layer (`pip install "headroom-ai[all]"`; installed automatically by `setup.sh`)

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
| `/design-analyze` | Platform dispatcher: extract design tokens from reference sites |
| `/design-language` | Define brand personality and aesthetic direction |
| `/design-evolve` | Platform dispatcher: merge new reference into design language |
| `/design-mockup` | Platform dispatcher: generate mockup from design language |
| `/design-implement` | Platform dispatcher: generate production code from mockup |
| `/design-refine` | Dispatch Impeccable refinement commands |
| `/design-verify` | Platform dispatcher: screenshot diff implementation vs mockup |
| `/verify-app` | Platform-detecting Playwright/XcodeBuildMCP app verification |
| `/verify-web` | Playwright browser verification of running web app |
| `/verify-ios` | XcodeBuildMCP iOS simulator verification |
| `/design-analyze-web` | Extract design tokens from web reference sites |
| `/design-analyze-ios` | Extract design tokens from iOS app references |
| `/design-evolve-web` | Merge new web reference into design language |
| `/design-evolve-ios` | Merge new iOS reference into design language |
| `/design-mockup-web` | Generate HTML mockup from design language |
| `/design-mockup-ios` | Generate SwiftUI mockup from design language |
| `/design-implement-web` | Generate production web code from mockup |
| `/design-implement-ios` | Generate production SwiftUI code from mockup |
| `/design-verify-web` | Screenshot diff web implementation vs mockup |
| `/design-verify-ios` | XcodeBuildMCP visual diff iOS implementation vs mockup |

**Config files:** `config/settings.json`, `config/mcp.json`, `config/statusline.sh`, `config/hooks/`

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
- Creates a trimmed CLAUDE.md (navigation doc only, under 80 lines) if none exists
- Creates a `.claude/rules/` directory with glob-scoped rule files inferred from the repo's structure
- Handles bare repos, partially documented repos, and well-documented repos

### 4. MCP Bridge (Claude Code / Codex)

A TypeScript MCP server for bidirectional multi-agent communication.

**MCP Tools (messaging):**
- `send_context` — Send task context + meta-prompt between agents
- `get_messages` — Retrieve conversation history by UUID
- `get_unread` — Check for unread messages (marks as read on retrieval)
- `assign_task` — Assign tasks with domain and implementation details
- `report_status` — Report back with feedback or completion

**API Endpoints (messaging):**
- `POST /messages/send` — Send context between agents
- `GET /messages/conversation/:id` — Retrieve conversation history
- `GET /messages/unread?recipient=` — Fetch and mark-read unread messages
- `POST /tasks/assign` — Assign a task with domain classification
- `GET /tasks/:id` — Get a task by ID
- `GET /tasks/conversation/:id` — Get all tasks for a conversation
- `POST /tasks/report` — Report task status
- `GET /conversations` — Paginated conversation summaries

**Features:**
- SQLite store-and-forward (messages queue when recipient is offline)
- Conversation continuity via UUID
- Fastify REST API (port 3100) + MCP stdio server
- Full end-to-end type safety with `AppResult<T>` pattern
- Atomic transactions for multi-step operations

## Setup

```bash
git clone https://github.com/joi-fairshare/agentic-workflow.git ~/repos/agentic-workflow
cd ~/repos/agentic-workflow
./setup.sh
```

The setup script:
- Checks for `jq` and Docker (hard prerequisites — aborts with install instructions if missing)
- Symlinks skills into `~/.claude/skills/`
- Copies config files (settings, MCP)
- Installs safety hooks (`block-destructive.sh`, `block-push-main.sh`, `detect-secrets.sh`, `rtk-rewrite.sh`, `git-context.sh`) to `~/.claude/hooks/`
- Installs the statusline to `~/.claude/statusline.sh` and wires `statusLine` into `settings.json`
- Installs shell integration to `~/.claude/shell-integration.sh` and sources it from `~/.zshrc` / `~/.bashrc` for terminal width sync
- Installs and builds the MCP bridge
- Builds Serena Docker images (base TS/Python image; opt-in C# extension)
- Installs the `serena-docker` wrapper script to `~/.local/bin/`
- Registers `agentic-bridge` and `serena` MCP servers with Claude Code
- Adds plugin marketplaces and installs plugins (github, superpowers, compound-engineering, playwright)
- Registers `xcodebuildmcp` MCP server for iOS simulator automation
- Installs rtk (Homebrew on macOS, install script on Linux) and wires `rtk-rewrite.sh` into the Bash hook chain for token-efficient command output
- Installs headroom (`pip install "headroom-ai[all]"`) and registers the `headroom` MCP server with Claude Code and Codex
- Registers `prism-mcp` MCP server with Claude Code and Codex (persistent memory via prism-mcp-server, downloads on first use)

### Start the bridge

```bash
cd mcp-bridge && npm start    # Fastify on http://127.0.0.1:3100
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
npm test                  # Run all tests (99 tests)
npm run test:watch        # Watch mode
npm run test:coverage     # Enforce 100% coverage thresholds
```

Test coverage spans unit tests (controllers, services, DB client, schemas, utilities) and integration tests (all REST routes via Fastify inject and MCP tool handlers).

## Architecture

```
agentic-workflow/
├── .claude/
│   └── rules/                 # Glob-scoped domain rules (auto-loaded by Claude Code)
│       ├── bridge-services.md # AppResult, EventBus, MCP tools
│       ├── bridge-transport.md # Typed router, controllers, Zod schemas
│       ├── database.md        # SQLite schema, DbClient
│       ├── design.md          # Design pipeline, tokens, .impeccable.md
│       ├── hooks.md           # Hook protocols and installation
│       ├── mcp-servers.md     # MCP server usage rules (Serena, bridge, context7, etc.)
│       ├── skills.md          # Skill structure, preamble, pipeline, bootstrap
│       └── testing.md         # Test patterns, helpers, coverage policy
├── .serena/
│   └── project.yml            # Serena LSP per-repo config (TypeScript)
├── skills/                    # 35 Claude Code custom skills
│   ├── review/                # Multi-agent PR review
│   ├── postReview/            # GitHub comment publisher
│   ├── addressReview/         # Review fix implementer
│   └── enhancePrompt/         # Context-aware prompt rewriter
├── bootstrap/                 # Repo documentation generator skill
├── config/                    # Settings, MCP config, statusline script, and safety hooks
├── scripts/
│   └── serena-docker          # Wrapper script: mounts repo into Serena container
├── mcp-bridge/                # MCP bridge application
│   ├── src/
│   │   ├── application/       # AppResult<T>, EventBus, services (never throw)
│   │   ├── db/                # SQLite schema, client interface, transactions
│   │   ├── transport/         # Typed router, Zod schemas, controllers
│   │   ├── routes/            # Route factories (messages, tasks, conversations)
│   │   ├── server.ts          # Fastify server factory
│   │   ├── mcp.ts             # MCP stdio server (5 coordination tools)
│   │   └── index.ts           # REST API entry point
│   └── tests/                 # Vitest suite — unit + integration, 100% coverage
├── Dockerfile.serena           # Serena base image (TypeScript + Python LSPs)
├── Dockerfile.serena-csharp    # Serena C# extension image (opt-in)
└── setup.sh                   # One-command setup script
```
