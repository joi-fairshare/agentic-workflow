# Deployment Guide

## Deployment Model

This project runs **locally only**. There is no cloud deployment, no containerization, and no remote hosting. The MCP bridge runs on the developer's machine alongside whichever agent CLIs are installed (Claude Code, Codex, Cursor).

## Building for Production

```bash
cd ~/repos/agentic-workflow/mcp-bridge
npm install
npm run build
```

This compiles TypeScript from `src/` to `dist/` using `tsc`. The production entry points are:

| Entry Point | File | Purpose |
|-------------|------|---------|
| REST API | `dist/index.js` | Fastify server on port 3100 |
| MCP Server | `dist/mcp.js` | Stdio-based MCP server for Claude Code / Codex / Cursor |

## Registering the MCP Server

`./setup.sh` registers `agentic-bridge` (and the other MCP servers) with every selected provider. Manual equivalents:

### Claude Code

```bash
claude mcp add agentic-bridge -- node ~/repos/agentic-workflow/mcp-bridge/dist/mcp.js
```

This registers `agentic-bridge` as a stdio MCP server. Claude Code will spawn the process on demand and communicate via stdin/stdout. The server exposes five tools:

- `send_context` -- Send task context and meta-prompt between agents
- `get_messages` -- Retrieve conversation history by UUID
- `get_unread` -- Check for unread messages (marks as read on retrieval)
- `assign_task` -- Assign tasks with domain and implementation details
- `report_status` -- Report back with feedback or completion status

### Codex CLI

```bash
codex mcp add agentic-bridge -- node ~/repos/agentic-workflow/mcp-bridge/dist/mcp.js
```

Same registration pattern.

### Cursor

Add an entry under `mcpServers` in `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "agentic-bridge": {
      "command": "node",
      "args": ["/absolute/path/to/agentic-workflow/mcp-bridge/dist/mcp.js"]
    }
  }
}
```

All providers share the same SQLite database file, enabling bidirectional communication between agents on any mix of providers.

### MCP Config File

When Claude Code is a selected provider, the setup script copies `config/mcp.json` to `~/.claude/mcp.json` if one does not already exist. This file can also contain the MCP server registration. To check or update the config manually:

```bash
diff ~/.claude/mcp.json ~/repos/agentic-workflow/config/mcp.json
```

## SQLite Database

### Location

By default, the database file is created at `./bridge.db` relative to the working directory when the server starts. This can be overridden:

```bash
# Via environment variable
DB_PATH=~/data/bridge.db npm start

# Or in .env file
DB_PATH=/Users/you/data/bridge.db
```

The `createDatabase` function in `src/db/schema.ts` resolves the path:

```ts
const resolvedPath = dbPath ?? join(process.cwd(), "bridge.db");
```

### Schema

The database has two tables:

**messages** -- Store-and-forward message queue between agents:
- `id` (TEXT PRIMARY KEY)
- `conversation` (TEXT) -- UUID grouping related messages
- `sender` / `recipient` (TEXT) -- Agent identifiers
- `kind` (TEXT) -- One of: `context`, `task`, `status`, `reply`
- `payload` (TEXT) -- Message content
- `meta_prompt` (TEXT, nullable) -- Processing instructions for recipient
- `created_at` / `read_at` (TEXT) -- Timestamps

**tasks** -- Task tracking with status lifecycle:
- `id` (TEXT PRIMARY KEY)
- `conversation` (TEXT) -- Links to a message conversation
- `domain` (TEXT) -- e.g., `frontend`, `backend`, `security`
- `summary` / `details` / `analysis` (TEXT)
- `assigned_to` (TEXT, nullable)
- `status` (TEXT) -- One of: `pending`, `in_progress`, `completed`, `failed`
- `created_at` / `updated_at` (TEXT)

### Pragmas

The database is initialized with:
- `journal_mode = WAL` -- Write-Ahead Logging for concurrent read/write
- `foreign_keys = ON` -- Enforces referential integrity

### Backup

Since the database is a single SQLite file, backup is straightforward:

```bash
# Simple file copy (safe when server is stopped)
cp ~/repos/agentic-workflow/mcp-bridge/bridge.db ~/backups/bridge-$(date +%Y%m%d).db

# Online backup using SQLite CLI (safe while server is running)
sqlite3 ~/repos/agentic-workflow/mcp-bridge/bridge.db ".backup '~/backups/bridge-$(date +%Y%m%d).db'"
```

To start fresh, simply delete the database file. It will be recreated with the schema on next server start.

## Skills Deployment

Skills are deployed via **symlinks** managed by `setup.sh` (provider-specific logic in `providers/<name>/install.sh`). The script links each skill directory from the repo into every selected provider's skills directory, and records each provider in `~/.agentic-workflow/providers`:

```
~/.agentic-workflow/toolkit            -> ~/repos/agentic-workflow   (stable path; skills resolve _shared/ through it)
~/.claude/skills/review                -> ~/repos/agentic-workflow/skills/review
~/.claude/skills/bootstrap             -> ~/repos/agentic-workflow/bootstrap
<codex skills dir>/review              -> ~/repos/agentic-workflow/skills/review
<cursor skills dir>/review             -> ~/repos/agentic-workflow/skills/review
```

Provider skills directories are listed in `planning/PROVIDERS.md`.

Because these are symlinks, any changes to skill files in the repo are immediately reflected -- no reinstallation needed. The symlink approach means:

- `git pull` in the repo updates all skills instantly.
- Skills can be version-controlled and reviewed via normal Git workflow.
- Multiple machines stay in sync by pulling and re-running `setup.sh` if new skills are added.

### Adding a New Skill

1. Create the skill directory under `skills/` (or at the repo root for standalone skills like `bootstrap`).
2. Add the skill name to the `MANAGED_SKILLS` array in `setup.sh`.
3. Run `./setup.sh` on each machine to create the symlinks for every installed provider.

## New Machine Onboarding

Full setup from scratch:

```bash
# 1. Clone the repository
git clone https://github.com/vitalizecare/agentic-workflow.git ~/repos/agentic-workflow
cd ~/repos/agentic-workflow

# 2. Run the setup script (detects installed provider CLIs; or pass --providers)
./setup.sh                                  # or: ./setup.sh --providers claude,codex,cursor

# 3. (Optional) Start the REST API server
cd mcp-bridge
npm start
```

The setup script handles:
- Creating `~/.agentic-workflow/toolkit` and the `~/.agentic-workflow/providers` registry
- Symlinking all skills into each selected provider's skills directory
- Installing hooks per provider (native for Claude Code; via `config/hooks/adapters/` for Codex and Cursor)
- Installing and building `mcp-bridge/` and registering MCP servers with each selected provider
- Claude Code only: copying `settings.json` and `mcp.json` to `~/.claude/` (non-destructive -- skips if files exist), statusline, and plugin marketplaces

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | REST API port |
| `HOST` | `127.0.0.1` | Bind address (loopback only by default) |
| `DB_PATH` | `./bridge.db` | SQLite database file path |
| `ALLOW_REMOTE` | unset | Set to `1` to allow non-loopback binding (not recommended) |

The server will refuse to start if `HOST` is set to a non-loopback address without `ALLOW_REMOTE=1`, since the server has no authentication.
