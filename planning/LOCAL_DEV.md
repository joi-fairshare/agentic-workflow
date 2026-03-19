# Local Development Guide

## Prerequisites

| Requirement | Minimum Version | Purpose |
|-------------|----------------|---------|
| Node.js | >= 20 | Runtime for MCP bridge and build tooling |
| GitHub CLI (`gh`) | Latest | Required by review skills for PR interaction |
| Claude Code | Latest | Host for skills and MCP server registration |
| npm | Bundled with Node | Dependency management |

## Initial Setup

### 1. Clone the Repository

```bash
git clone https://github.com/joi-fairshare/agentic-workflow.git ~/repos/agentic-workflow
cd ~/repos/agentic-workflow
```

### 2. Run the Setup Script

```bash
./setup.sh
```

The setup script performs the following:

1. **Symlinks skills** into `~/.claude/skills/`:
   - `review`, `postReview`, `addressReview`, `enhancePrompt`, `bootstrap`
   - If a directory already exists (not a symlink), it prompts before replacing.

2. **Copies config files** to `~/.claude/`:
   - `settings.json` -- only if no existing file (will not overwrite).
   - `mcp.json` -- only if no existing file (will not overwrite).
   - If files exist, it prints a `diff` command for manual comparison.

3. **Installs MCP bridge dependencies**:
   - Runs `npm install` inside `mcp-bridge/`.

### 3. Build the MCP Bridge

```bash
cd ~/repos/agentic-workflow/mcp-bridge
npm run build
```

This runs `tsc` and outputs compiled JavaScript to `mcp-bridge/dist/`.

### 4. Register the MCP Server with Claude Code

```bash
claude mcp add agentic-bridge -- node ~/repos/agentic-workflow/mcp-bridge/dist/mcp.js
```

This registers the bridge as a stdio-based MCP server that Claude Code can invoke.

## Environment Configuration

Copy the example environment file and edit as needed:

```bash
cd ~/repos/agentic-workflow/mcp-bridge
cp .env.example .env
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | Port for the Fastify REST API server |
| `HOST` | `127.0.0.1` | Bind address (loopback only by default) |
| `DB_PATH` | `./bridge.db` | Path to the SQLite database file |
| `ALLOW_REMOTE` | unset | Set to `1` to allow binding to non-loopback addresses |

The server refuses to bind to non-loopback addresses unless `ALLOW_REMOTE=1` is set, since it has no authentication layer.

## Running the Servers

### REST API Server (Fastify)

```bash
cd ~/repos/agentic-workflow/mcp-bridge

# Development mode (tsx, auto-restarts not included -- use manually)
npm run dev

# Production mode (requires prior build)
npm run build
npm start
```

The REST API starts at `http://127.0.0.1:3100` by default. It exposes message and task routes for HTTP-based agent communication.

### MCP Server (stdio)

The MCP server runs as a stdio process, intended to be launched by Claude Code or Codex CLI:

```bash
# Direct invocation (for testing)
cd ~/repos/agentic-workflow/mcp-bridge
npm run build
npm run mcp

# Normal usage: Claude Code spawns it via the registered MCP config
claude mcp add agentic-bridge -- node ~/repos/agentic-workflow/mcp-bridge/dist/mcp.js
```

The MCP server exposes five tools: `send_context`, `get_messages`, `get_unread`, `assign_task`, `report_status`.

## Running Tests

```bash
cd ~/repos/agentic-workflow/mcp-bridge

# Single run
npm run test

# Watch mode
npm run test:watch

# Type-check without emitting files
npm run typecheck
```

Tests use in-memory SQLite -- no database file is created or modified during testing.

## Building

```bash
cd ~/repos/agentic-workflow/mcp-bridge
npm run build
```

Build configuration (from `tsconfig.json`):

| Setting | Value |
|---------|-------|
| Target | ES2022 |
| Module | Node16 |
| Module Resolution | Node16 |
| Output Directory | `dist/` |
| Source Directory | `src/` |
| Strict Mode | Enabled |
| Source Maps | Enabled |
| Declaration Files | Enabled |

The build compiles `src/**/*` to `dist/`, excluding `node_modules`, `dist`, and `tests`.

## Project Structure

```
agentic-workflow/
├── skills/                    # Claude Code custom skills (symlinked to ~/.claude/skills/)
│   ├── review/                # Multi-agent PR review
│   ├── postReview/            # GitHub comment publisher
│   ├── addressReview/         # Review fix implementer
│   └── enhancePrompt/         # Context-aware prompt rewriter
├── bootstrap/                 # Repo documentation generator skill
├── config/                    # Settings & MCP config archive
│   ├── settings.json
│   └── mcp.json
├── mcp-bridge/                # MCP bridge application
│   ├── src/
│   │   ├── application/       # AppResult<T>, services (never throw)
│   │   ├── db/                # SQLite schema, client interface, transactions
│   │   ├── transport/         # Typed router, Zod schemas, controllers
│   │   ├── routes/            # Route factories
│   │   ├── server.ts          # Fastify server factory
│   │   ├── mcp.ts             # MCP stdio server entry point
│   │   └── index.ts           # REST API entry point
│   ├── tests/                 # Vitest test files
│   ├── dist/                  # Compiled output (gitignored)
│   ├── .env.example           # Environment variable template
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
├── setup.sh                   # One-command setup script
└── README.md
```

## Common Development Tasks

### Adding a New Service

1. Create the service function in `mcp-bridge/src/application/services/`.
2. Return `AppResult<T>` -- never throw exceptions.
3. Wire it into a route in `mcp-bridge/src/routes/` (for REST) and/or register a tool in `mcp-bridge/src/mcp.ts` (for MCP).
4. Add tests in `mcp-bridge/tests/` using the `beforeEach` in-memory DB pattern.

### Adding a New Skill

1. Create a directory under `skills/` with the skill's name.
2. Add the skill name to the `for` loop in `setup.sh` so it gets symlinked on setup.
3. Re-run `./setup.sh` to install the symlink.
