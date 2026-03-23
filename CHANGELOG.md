# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-03-22

### Added

- Dockerized Serena LSP integration (`Dockerfile.serena`, `Dockerfile.serena-csharp`, `scripts/serena-docker` wrapper)
- Per-repo Serena config (`.serena/project.yml`) with TypeScript language settings and sensitive path exclusions
- `setup.sh` builds Serena Docker images, installs wrapper script, and registers MCP server globally
- `.claude/rules/mcp-servers.md` documenting when to use each MCP server vs built-in tools
- `.claude/settings.json` with `disableBypassPermissionsMode` to prevent unsafe permissions bypass
- `.dockerignore` for Docker builds
- `.gitignore` entries for Serena runtime data and `settings.local.json`
- Bootstrap skill Step 7: auto-generates `.serena/project.yml` with language detection

### Changed

- Removed MCP server table from all skill preambles (centralized in `.claude/rules/mcp-servers.md`)

### Fixed

- `project_name` field and bootstrap Step 7 clarifications in `.serena/project.yml`
- Docker infrastructure: opt-in C# build, removed port exposure, granular volume mounts, `--pull` flag, `.dockerignore`
- Documented `dotnet-install.sh` trust model and version pinning rationale
- Miscellaneous docs, `.gitignore`, `project.yml` comment, `settings.local.json` gitignore, architecture docs fixes

## [Unreleased] - 2026-03-22

### Added

- Adaptive statusline (`statusline.sh`) with context-first layout and five width tiers: FULL (>=116), MEDIUM (>=101), NARROW (>=78), COMPACT (>=65), COMPACT-S (<65)
- Separate Usage (5h/7d rate limits) and Context columns in the statusline display
- Mid-session terminal resize detection via hooks registered in `settings.json` (`PreToolUse`/`PostToolUse`/`Stop`)
- Statusline installation integrated into `setup.sh`
- `statusLine` config block added to `settings.json`

### Fixed

- Added COMPACT-S tier for terminals narrower than 65 columns to prevent field overflow
- Added 50 ms sleep in `statusline.sh` before reading terminal width to resolve SIGWINCH race condition
- Added 50 ms sleep after SIGWINCH in the Stop hook to close the resize race
- Reliable terminal width resolution via shell integration file (avoids `tput` subshell returning 80)
- Aligned Context header label with data column width across all tiers
- Reverted tput-first approach; `$COLUMNS` is now the primary width source
- Shell PID written out for hook-based resize signaling
- Replaced double-wide Unicode `↺` with a plain space in usage reset format to prevent rendering issues
- Widened field formats to prevent overflow; cache field preserved through the NARROW tier
- `jq` is now a hard prerequisite with an abort message and install instructions if missing
- API wait field shows `--` when the field is absent from the JSON payload
- Quoted numeric `jq` fields to prevent eval injection; removed Rate label from fallback path
- `setup.sh` merges hooks additively into existing `settings.json` rather than replacing; skips writing `shell-integration.sh` when the file is already identical
- `setup.sh` initializes `terminal_width` via `stty size </dev/tty` instead of relying on `$COLUMNS` (which is unset in the installer subshell)
- `setup.sh` guards the `statusLine` key with `jq has("statusLine")` and uses `grep -qF` for exact source-line matching
- `config/statusline.sh` type-guards `resets_at` timestamps: applies `floor | tostring` only when the value is a JSON number, passes strings through as-is
- `config/statusline.sh` removes `tput cols` from the width fallback; `COLS` now derives from `${COLUMNS:-}` only (tput is unreliable in Claude Code subprocesses)

## [Unreleased] - 2026-03-22

### Changed

- Removed all `/* v8 ignore */` annotations from source files — coverage must be earned through real tests
- Dropped 100% coverage threshold enforcement from vitest.config.ts in both packages
- Updated TESTING.md, ARCHITECTURE.md, and CLAUDE.md to document prohibition on v8 ignore annotations

## [Unreleased] - 2026-03-21

### Added

- Conversation memory system with node/edge graph stored in SQLite
- Memory schema DDL with nodes, edges, FTS5 full-text index, and cursors
- MemoryDbClient with node/edge CRUD, FTS5 search, and cursor-based pagination
- Embedding service with sqlite-vec KNN table, batch support, and graceful degradation
- Secret filter with regex-based redaction for API keys, tokens, and passwords
- Bounded async queue with overflow drop and setImmediate drain
- JSONL transcript parser with Zod validation and skip-on-error resilience
- Bridge ingestion service with backfill, idempotency, and repo slug normalization
- Transcript ingestion service with reply_to/contains edges
- Hybrid search combining FTS5 full-text, sqlite-vec KNN, and RRF fusion ranking
- BFS graph traversal with direction, depth, and kind filters
- Token-budgeted context assembly combining search and graph traversal
- Zod schemas for all memory REST endpoints
- Memory controller with 10 REST routes
- 5 MCP memory tools: search, traverse, context, link, and node
- Memory system integrated into bridge server with lazy initialization and queue
- Git metadata ingestion for commits and pull requests
- Topic inference via embedding clustering with k-means++ initialization
- Decision extraction via regex heuristics
- Memory Explorer UI page with search, graph visualization, and context views

### Fixed

- Schema integrity: FK constraints, UNIQUE source index, FTS5 sanitization, removed raw handle
- MCP tool hardening: persistent DB path, input validation, secret filtering
- UI route alignment, ContextSection schema, kind validation, link validation
- Cursor-based git ingestion, SHA lookup index, repo-scoped KNN queries
- Input bounds, secret patterns, and error handling hardened across services
- Type safety improvements in embedding service and route typing
- K-means++ initialization optimization and bounded conversation loading in topic inference
- Edge uniqueness test updated for UNIQUE source index
- Service-layer performance, idempotency, and pagination improvements
- Memory client, schema docs, and controller transaction hardening

### Changed

- Extracted custom hooks from Memory Explorer page component for reusability
- Relocated memory-controller tests to the `tests/` directory for consistency
- Updated testing documentation with coverage targets and new conventions

### Added (Test Harness)

- Coverage infrastructure for mcp-bridge with 100% line/branch/function thresholds enforced via Vitest
- Test infrastructure for UI package with Vitest and happy-dom
- Unit tests for DbClient covering all prepared-statement operations
- Unit tests for message, task, and conversation controllers
- Integration tests for message, task, conversation, and memory routes via Fastify inject
- Integration tests for SSE endpoint and server error handling
- MCP tool handler tests with `resultToContent` validation
- Tests for result helpers, route types, and memory-schema utilities
- Tests for secret-filter, transcript-parser, and BoundedQueue
- Coverage gap tests for schema validation, SSE integration, and embedding service
- Coverage gap tests for search-memory, ingest-git, ingest-transcript, and extract-decisions
- Coverage gap tests for controllers, memory-client, transcript-parser, and infer-topics
- Comprehensive UI lib and hook tests achieving 100% coverage
- Shared test helpers module (`tests/helpers.ts`) eliminating duplicated boilerplate across 24 test files
- FTS5 adversarial input tests for double quotes, boolean operators, wildcards, parentheses, and backslashes

### Fixed (Test Harness)

- SSE integration test now uses event-driven resolution instead of hardcoded setTimeout
- Queue test uses retry-based `waitUntil(predicate, timeout)` instead of fixed-delay polling
- All memory test files now enable `foreign_keys = ON` pragma matching production behavior
- Added cross-reference comments for duplicated `resultToContent` in mcp-tools.test.ts and mcp.ts
- Mock `EmbeddingService.isReady()` now returns `true` matching production warmed-up state

## [1.0.0] - 2026-03-19

### Added

- Next.js 15 UI dashboard with conversation list and detail pages
- Conversation list page with filtering and real-time updates
- Conversation detail page with timeline and diagrams
- DiagramRenderer (Mermaid), Timeline, and CopyButton UI components
- API client, SSE hook, and diagram builders for the UI layer
- GET /events SSE endpoint for real-time streaming
- GET /conversations REST endpoint with query and service layer
- EventBus pub/sub system for SSE streaming
- Bootstrap-generated planning docs and CLAUDE.md

### Fixed

- Increased delay in ordering test to prevent flaky failures
- setup.sh now builds MCP bridge, registers with Claude/Codex, and installs plugins
- Addressed review findings for atomicity, security, and DX
