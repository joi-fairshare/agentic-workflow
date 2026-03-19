# Deployment Guide

## Deployment Model

This project runs **locally only**. There is no cloud deployment, no containerization, and no remote hosting. The MCP bridge runs on the developer's machine alongside Claude Code and Codex CLI.

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
| MCP Server | `dist/mcp.js` | Stdio-based MCP server for Claude Code / Codex |

## Registering the MCP Server

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

Same registration pattern. Both Claude Code and Codex share the same SQLite database file, enabling bidirectional communication between the two agents.

### MCP Config File

The setup script copies `config/mcp.json` to `~/.claude/mcp.json` if one does not already exist. This file can also contain the MCP server registration. To check or update the config manually:

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

Skills are deployed via **symlinks** managed by `setup.sh`. The script links directories from the repo into `~/.claude/skills/`:

```
~/.claude/skills/review        -> ~/repos/agentic-workflow/skills/review
~/.claude/skills/postReview    -> ~/repos/agentic-workflow/skills/postReview
~/.claude/skills/addressReview -> ~/repos/agentic-workflow/skills/addressReview
~/.claude/skills/enhancePrompt -> ~/repos/agentic-workflow/skills/enhancePrompt
~/.claude/skills/bootstrap     -> ~/repos/agentic-workflow/bootstrap
```

Because these are symlinks, any changes to skill files in the repo are immediately reflected -- no reinstallation needed. The symlink approach means:

- `git pull` in the repo updates all skills instantly.
- Skills can be version-controlled and reviewed via normal Git workflow.
- Multiple machines stay in sync by pulling and re-running `setup.sh` if new skills are added.

### Adding a New Skill

1. Create the skill directory under `skills/` (or at the repo root for standalone skills like `bootstrap`).
2. Add the skill name to the `for` loop in `setup.sh`:
   ```bash
   for skill in review postReview addressReview enhancePrompt newSkillName; do
   ```
3. Run `./setup.sh` on each machine to create the symlink.

## New Machine Onboarding

Full setup from scratch:

```bash
# 1. Clone the repository
git clone https://github.com/joi-fairshare/agentic-workflow.git ~/repos/agentic-workflow
cd ~/repos/agentic-workflow

# 2. Run the setup script (installs skills, config, and npm dependencies)
./setup.sh

# 3. Build the MCP bridge
cd mcp-bridge
npm run build

# 4. Register the MCP server with Claude Code
claude mcp add agentic-bridge -- node ~/repos/agentic-workflow/mcp-bridge/dist/mcp.js

# 5. (Optional) Register with Codex CLI
codex mcp add agentic-bridge -- node ~/repos/agentic-workflow/mcp-bridge/dist/mcp.js

# 6. (Optional) Start the REST API server
npm start
```

The setup script handles:
- Symlinking all skills to `~/.claude/skills/`
- Copying `settings.json` and `mcp.json` to `~/.claude/` (non-destructive -- skips if files exist)
- Running `npm install` in `mcp-bridge/`

After setup, it prints a reminder for manual plugin installations:
- claude-plugins-official (Anthropic official)
- voltagent-subagents (subagent catalog)
- compound-engineering-plugin (EveryInc/compound-engineering-plugin)

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | REST API port |
| `HOST` | `127.0.0.1` | Bind address (loopback only by default) |
| `DB_PATH` | `./bridge.db` | SQLite database file path |
| `ALLOW_REMOTE` | unset | Set to `1` to allow non-loopback binding (not recommended) |

The server will refuse to start if `HOST` is set to a non-loopback address without `ALLOW_REMOTE=1`, since the server has no authentication.
