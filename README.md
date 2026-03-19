# Agentic Workflow

A portable Claude Code workflow toolkit: custom skills, configuration archive, repo bootstrapper, and a bidirectional MCP bridge for multi-agent communication.

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

**Config files:** `config/settings.json`, `config/mcp.json`

### 2. Bootstrap Skill

Invocable via `/bootstrap` in any repo. Orchestrates documentation generation:

- Detects which of 17 Pivot-pattern docs exist (BUSINESS_PLAN, ARCHITECTURE, ERD, etc.)
- Generates missing docs adapted to the target repo's tech stack
- Creates a CLAUDE.md if none exists
- Handles bare repos, partially documented repos, and well-documented repos

### 3. MCP Bridge (Claude Code / Codex)

A TypeScript MCP server for bidirectional multi-agent communication.

**MCP Tools:**
- `send_context` — Send task context + meta-prompt between agents
- `get_messages` — Retrieve conversation history by UUID
- `assign_task` — Assign tasks with domain and implementation details
- `report_status` — Report back with feedback or completion

**Features:**
- SQLite store-and-forward (messages queue when recipient is offline)
- Conversation continuity via UUID
- Fastify REST API + MCP stdio server
- Full end-to-end type safety with `AppResult<T>` pattern

## Setup

```bash
# Clone and run setup
git clone <this-repo> ~/repos/agentic-workflow
cd ~/repos/agentic-workflow
./setup.sh

# Install MCP bridge
cd mcp-bridge
npm install
npm run build
```

### Register MCP Server with Claude Code

```bash
claude mcp add agentic-bridge -- node ~/repos/agentic-workflow/mcp-bridge/dist/mcp.js
```

### Run the REST API (optional)

```bash
cd mcp-bridge
npm start          # Fastify on http://127.0.0.1:3100
```

## Architecture

```
agentic-workflow/
├── skills/                    # Claude Code custom skills
│   ├── review/                # Multi-agent PR review
│   ├── postReview/            # GitHub comment publisher
│   ├── addressReview/         # Review fix implementer
│   └── enhancePrompt/         # Context-aware prompt rewriter
├── bootstrap/                 # Repo documentation generator skill
├── config/                    # Settings & MCP config archive
├── mcp-bridge/                # MCP bridge application
│   └── src/
│       ├── application/       # AppResult, services
│       ├── db/                # SQLite schema & client
│       ├── transport/         # Typed router, schemas, controllers
│       ├── routes/            # Route factories
│       ├── server.ts          # Fastify server
│       └── mcp.ts             # MCP stdio server
└── setup.sh                   # One-command setup script
```
