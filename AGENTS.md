# AGENTS.md — Vitalize Workflow Toolkit

> Vitalize Workflow Toolkit — provider-agnostic agent workflow toolkit for Claude Code, Codex, and Cursor: 44 native skills + 3 fetched external packs (impeccable, emil-design-eng, taste-skill), config archive, repo bootstrapper, MCP bridge for multi-agent communication, and token-efficiency tools (rtk + headroom).

Domain-specific rules live in `.agents/rules/` — one file per rule, the only copy. `.claude/rules` and `.cursor/rules/*.mdc` are symlinks to it (auto-loaded by Claude Code and Cursor), and `CLAUDE.md` is a symlink to this file. Codex reads the Rules Index at the bottom of this file. After adding or removing a rule, run `scripts/sync-rules.sh`.

## Required Context

| Document | Purpose |
|----------|---------|
| `planning/ARCHITECTURE.md` | System components and data flow |
| `planning/PROVIDERS.md` | Claude Code / Codex / Cursor support matrix and canonical layout |
| `planning/API_CONTRACT.md` | MCP bridge REST & tool schemas |
| `planning/CODE_STYLE.md` | TypeScript conventions and patterns |
| `planning/TESTING.md` | Test strategy and coverage targets |
| `planning/ERD.md` | SQLite schema and relationships |
| `skills/_shared/capabilities.md` | Capability → tool map used by all skill text |

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
├── skills/        # 44 provider-neutral skills (linked into each provider's skills dir)
├── bootstrap/     # /bootstrap skill — repo documentation generator
├── config/        # Settings, MCP config, statusline, safety hooks (+ hooks/adapters/ per provider)
├── providers/     # Per-provider installers (claude, codex, cursor)
├── mcp-bridge/    # MCP bridge + REST API (Fastify, SQLite)
├── scorer/        # Daily cost/involvement report from provider session transcripts
├── planning/      # Project documentation
├── .agents/rules/ # Glob-scoped domain rules (.claude/rules and .cursor/rules link here)
├── .serena/       # Serena LSP project configuration
├── scripts/       # Utility scripts (sync-rules.sh, serena-docker, probe.sh, install-scorer.sh)
└── setup.sh       # One-command setup for every installed provider
```

## Commands

```bash
# TypeScript packages (each has test, test:coverage, typecheck, build)
cd mcp-bridge && npm test               # Vitest, in-memory SQLite
cd scorer && npm test                   # Vitest
cd judge && npm test                    # Vitest
scorer --since 7d [--provider claude|codex|cursor|all]  # Report to ~/.agentic-workflow/scorer/reports/
scorer probe                            # Summarize the hook-input probe

# Rules (edit .agents/rules/, then regenerate)
scripts/sync-rules.sh                   # Link .claude/rules, .cursor/rules, CLAUDE.md; refresh Rules Index
scripts/sync-rules.sh --check           # Exit 1 if links or the Rules Index are out of date

# Bash tests
bash providers/tests/install.test.sh
bash scripts/tests/sync-rules.test.sh
bash scripts/tests/probe.test.sh
bash scripts/tests/find-duplicate-skills.test.sh
bash config/hooks/tests/codex-adapter.test.sh
bash config/hooks/tests/cursor-adapter.test.sh
bash config/hooks/tests/provider-install-hooks.test.sh
bash config/hooks/tests/probe-log.test.sh
bash config/hooks/tests/judge-health.test.sh
for t in config/lib/tests/*.test.sh; do bash "$t" || echo "FAILED: $t"; done  # merge-hook, levers, installers

# Levers and probe (default provider: claude)
scripts/install-<lever>.sh --provider claude|codex|cursor
scripts/probe.sh [--provider claude|codex|cursor] on|off|status
scripts/install-scorer.sh               # Build scorer, install CLI + launchd job

# Setup (from repo root)
./setup.sh --providers claude,codex,cursor --dry-run   # Print every change, write nothing
./setup.sh [--providers ...]            # Default: detect installed CLIs. Links skills, installs
                                        # hooks + levers + MCP servers per provider, builds bridge,
                                        # judge, scorer, Serena image
```

After installing for Codex, open `codex` and run `/hooks` to trust the `aw:*` hooks.

## Merge Gate

Before merging any PR:
1. `npm run typecheck` passes with zero errors in `mcp-bridge`, `scorer`, and `judge`
2. `npm test` passes in `mcp-bridge`, `scorer`, and `judge`, and every bash test listed above passes
3. `scripts/sync-rules.sh --check` passes (rule links and Rules Index match `.agents/rules/`)
4. `./setup.sh --providers claude,codex,cursor --dry-run` runs cleanly
5. No `/* v8 ignore */` annotations in source files (prohibited — write the test instead)
6. No `any` types outside of Fastify integration boundaries

## Commit Conventions

Format: `type: short description`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

Keep commits atomic — one logical change per commit. See `planning/COMMIT_STRATEGY.md` for details.

<!-- === RULES INDEX START (generated by sync-rules.sh — edit .agents/rules/, then run scripts/sync-rules.sh) === -->
## Rules Index

Domain rules live in `.agents/rules/`. Before editing a file, read every rule below whose globs match it ("always" rules apply to every task). Claude Code and Cursor load them automatically through `.claude/rules` and `.cursor/rules/` links; Codex does not — read them yourself.

| Rule | Description | Applies to | Path |
|------|-------------|------------|------|
| `bridge-services` | MCP bridge service layer — AppResult, service contracts, MCP tools, route registration | `mcp-bridge/src/application/**`, `mcp-bridge/src/routes/**`, `mcp-bridge/src/server.ts`, `mcp-bridge/src/mcp.ts`, `mcp-bridge/src/index.ts` | `.agents/rules/bridge-services.md` |
| `bridge-transport` | MCP bridge transport layer — typed routes, controller factories, Zod schemas | `mcp-bridge/src/transport/**` | `.agents/rules/bridge-transport.md` |
| `database` | Bridge SQLite database — client, prepared statements, schema, transactions | `mcp-bridge/src/db/**` | `.agents/rules/database.md` |
| `design` | Design pipeline artifacts — tokens, .impeccable.md, DESIGN_SYSTEM.md, design-* skills | `design-tokens.json`, `.impeccable.md`, `planning/DESIGN_SYSTEM.md`, `skills/design-*/**` | `.agents/rules/design.md` |
| `hooks` | Safety and context hooks — per-provider adapters, protocols, installation | `config/hooks/**`, `config/settings.json` | `.agents/rules/hooks.md` |
| `mcp-servers` | MCP servers registered globally with every provider — available in every session | always | `.agents/rules/mcp-servers.md` |
| `skills` | Skill structure, preamble, output directories, pipeline, and installation | `skills/**`, `bootstrap/**` | `.agents/rules/skills.md` |
| `testing` | Test infrastructure, shared helpers, and coverage policy | `**/*.test.ts`, `**/*.spec.ts`, `**/vitest.config.ts`, `mcp-bridge/tests/helpers.ts` | `.agents/rules/testing.md` |
<!-- === RULES INDEX END === -->
