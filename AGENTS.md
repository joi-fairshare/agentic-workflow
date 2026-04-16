# AGENTS.md — agentic-workflow

> Portable AI-agent workflow toolkit (optimized for ChatGPT Codex + Claude Code): 34 custom skills, config archive, repo bootstrapper, MCP bridge for multi-agent communication, and token-efficiency tools (rtk + headroom).

Domain-specific rules are in `.claude/rules/` and `.codex/rules/`/`.Codex/rules/` — they load automatically when working on matching files.

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
| Database | SQLite via better-sqlite3, WAL mode |
| MCP | @modelcontextprotocol/sdk (stdio transport) |
| LSP (Serena) | Docker (Dockerized Serena MCP server via `scripts/serena-docker`) |
| Validation | Zod 3 |
| Test | Vitest (in-memory SQLite) |
| Build | tsc (ESM, Node16 module resolution) |

## Directory Structure

```
agentic-workflow/
├── skills/        # 34 portable skills (symlinked to ~/.claude/skills/ and/or ~/.codex/skills/)
├── bootstrap/     # /bootstrap skill — repo documentation generator
├── config/        # Settings, MCP config, statusline script, and safety hooks
├── mcp-bridge/    # MCP bridge + REST API (Fastify, SQLite)
├── planning/      # Project documentation
├── .claude/rules/ # Glob-scoped domain rules (Claude Code)
├── .codex/rules/  # Glob-scoped domain rules (Codex; optional mirror)
├── .serena/       # Serena LSP project configuration
├── scripts/       # Utility scripts (serena-docker wrapper)
└── setup.sh       # One-command setup: skills, statusline, hooks, config, bridge, Serena
```

## Commands

```bash
# MCP Bridge
cd mcp-bridge && npm test               # Vitest (all tests, in-memory SQLite)
cd mcp-bridge && npm run test:coverage  # Run with 100% coverage enforcement
cd mcp-bridge && npm run build          # TypeScript → dist/

# Setup (from repo root)
AI_TARGETS=both ./setup.sh   # Target: both (default), claude, or codex
```

## Merge Gate

Before merging any PR:
1. `npm run typecheck` passes with zero errors
2. `npm test` passes with all tests green (99 bridge)
3. No `/* v8 ignore */` annotations in source files (prohibited — write the test instead)
4. No `any` types outside of Fastify integration boundaries

## Commit Conventions

Format: `type: short description`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

Keep commits atomic — one logical change per commit. See `planning/COMMIT_STRATEGY.md` for details.
