# CLAUDE.md — agentic-workflow

> Portable Claude Code workflow toolkit: 22 custom skills, config archive, repo bootstrapper, a bidirectional MCP bridge for multi-agent communication, and a conversation memory system with graph-based retrieval.

Domain-specific rules are in `.claude/rules/` — they load automatically when working on matching files.

## Required Context

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
| Embeddings | @huggingface/transformers (768-dim, lazy-loaded) |
| MCP | @modelcontextprotocol/sdk (stdio transport) |
| LSP (Serena) | Docker (Dockerized Serena MCP server via `scripts/serena-docker`) |
| Validation | Zod 3 |
| Test | Vitest (in-memory SQLite; happy-dom for UI hooks) |
| Build | tsc (ESM, Node16 module resolution) |

## Directory Structure

```
agentic-workflow/
├── skills/        # 22 Claude Code custom skills (symlinked to ~/.claude/skills/)
├── bootstrap/     # /bootstrap skill — repo documentation generator
├── config/        # Settings, MCP config, statusline script, and safety hooks
├── mcp-bridge/    # MCP bridge + REST API (Fastify, SQLite, sqlite-vec)
├── ui/            # Next.js 15 App Router conversation dashboard
├── planning/      # Project documentation
├── .claude/rules/ # Glob-scoped domain rules (auto-loaded by Claude Code)
├── .serena/       # Serena LSP project configuration
├── scripts/       # Utility scripts (serena-docker wrapper)
├── start.sh       # Start bridge + UI together
└── setup.sh       # One-command setup: skills, statusline, hooks, config, bridge, Serena, UI
```

## Commands

```bash
# MCP Bridge
cd mcp-bridge && npm test               # Vitest (all tests, in-memory SQLite)
cd mcp-bridge && npm run test:coverage  # Run with 100% coverage enforcement
cd mcp-bridge && npm run build          # TypeScript → dist/

# UI Dashboard
cd ui && npm test               # Vitest (hooks + lib tests)
cd ui && npm run test:coverage  # Run with 100% coverage enforcement

# Setup (from repo root)
./setup.sh             # Symlink skills, copy config, install statusline, install deps, build bridge, build Serena Docker image, register MCP servers, create output dir
./start.sh             # Start bridge (:3100) + UI (:3000) together
```

## Merge Gate

Before merging any PR:
1. `npm run typecheck` passes with zero errors
2. `npm test` passes with all tests green (341 bridge + 67 UI)
3. No `/* v8 ignore */` annotations in source files (prohibited — write the test instead)
4. No `any` types outside of Fastify integration boundaries

## Commit Conventions

Format: `type: short description`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

Keep commits atomic — one logical change per commit. See `planning/COMMIT_STRATEGY.md` for details.
