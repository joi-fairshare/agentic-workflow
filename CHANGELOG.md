# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-03-26

### Added

- `config/hooks/rtk-rewrite.sh`: New PreToolUse hook (4th in Bash chain) that rewrites eligible commands (`git status/log/diff/push/show`, `vitest run`, `npm test`, `npm run test`, `tsc`, `npx tsc`, `eslint`, `npx eslint`, `cargo test/build`, `next build`) to `rtk` equivalents for 60-90% token savings on command output. Silent passthrough if rtk is not installed.
- `config/hooks/bridge-context.sh`: New SessionStart hook that derives the repo slug, queries the agentic-bridge `/memory/context` endpoint, and prints recent decisions/topics/tasks at session open. Silent no-op when bridge is unreachable.
- `setup.sh`: Added `=== Installing rtk ===` section (Homebrew on macOS, install script on Linux, fatal on failure), `=== Installing headroom ===` section (`pip3 install headroom-ai[all]`, fatal on failure), headroom MCP registration with Claude Code and Codex, `rtk-rewrite.sh` added as 4th entry in the Bash hook chain, `bridge-context.sh` SessionStart hook registration.
- `.claude/rules/hooks.md`: Added `rtk-rewrite.sh` and `bridge-context.sh` rows and hook ordering note.
- `.claude/rules/mcp-servers.md`: Added `headroom` row to the MCP server table.
- `docs/superpowers/specs/rtk-headroom-bridge-context-integration.md`: Design spec documenting the integration architecture for rtk, headroom, and bridge-context.

### Changed

- `README.md` and `CLAUDE.md`: Updated taglines, prerequisites, and setup description to reflect rtk, headroom, and bridge-context additions.

---

## [Unreleased] - 2026-03-23

### Added

- 12 new platform-specific sub-skills: `verify-web`, `verify-ios`, `design-analyze-web`, `design-analyze-ios`, `design-evolve-web`, `design-evolve-ios`, `design-mockup-web`, `design-mockup-ios`, `design-implement-web`, `design-implement-ios`, `design-verify-web`, `design-verify-ios`
- Generic `skills/_shared/skill-lock.sh` for mutual exclusion across concurrent simulator and browser sessions; used by `verify-ios` and `verify-web`
- Platform dispatcher pattern: `verify-app`, `design-analyze`, `design-evolve`, `design-mockup`, `design-implement`, and `design-verify` detect the target platform and delegate to the appropriate sub-skill
- `MANAGED_SKILLS` in `setup.sh` expanded from 22 to 34 entries covering all new sub-skills
- `xcodebuildmcp` (pinned at `xcodebuildmcp@2.3.0`) registered as MCP server for iOS Simulator control (build, launch, `snapshot_ui`, screenshot, tap, swipe)
- Design pipeline updated in `.claude/rules/design.md` to reflect `[web|ios]` argument variants
- `mcp-servers.md` rule updated with `xcodebuildmcp` usage guidance and a "When to use XcodeBuildMCP" quick-reference table

### Changed

- 6 existing skills (`verify-app`, `design-analyze`, `design-evolve`, `design-mockup`, `design-implement`, `design-verify`) rewritten as thin platform dispatchers — all execution logic moved to platform-specific sub-skills
- `verify-web` is the new home for `browser-lock.sh` (previously in `verify-app`); `verify-app` no longer carries browser-locking logic
- `mobai` MCP server replaced by `xcodebuildmcp` for iOS Simulator automation
- Preamble table in `skills/_preamble.md` updated to list all 34 skills; change propagated to all 16 existing `SKILL.md` files
- `skills/_design-preamble.md` updated to reflect the dispatcher pattern for design sub-skills
- `.gitignore` updated to exclude `.claude/worktrees/` directory

### Fixed

- TOCTOU race in `skill-lock.sh` `acquire_lock` — replaced non-atomic test-then-create with an atomic `O_EXCL` open pattern
- `LOCK_NAME` input validation in `skill-lock.sh` to reject path traversal characters (e.g. `../`)
- `xcodebuildmcp` pinned to `xcodebuildmcp@2.3.0` (previously `@latest`) to eliminate supply-chain risk from unreviewed upstream updates
- Argument hints corrected in dispatcher `SKILL.md` frontmatter to show `[web|ios]` syntax
- Simulator lock acquisition hardened with error handling for edge cases in `skill-lock.sh`

---

## [Unreleased] - 2026-03-23

### Added

- `config/hooks/` directory with four shell hooks: `block-destructive.sh`, `block-push-main.sh`, `detect-secrets.sh`, and `git-context.sh`
- `config/settings.json` updated with consolidated PreToolUse (Bash matcher) and SessionStart hook registrations
- `.claude/rules/hooks.md` documenting PreToolUse vs SessionStart protocols, hook file inventory, and steps for adding new hooks
- `setup.sh` installs hooks to `~/.claude/hooks/` using an idempotent replace strategy (copy, not symlink)

### Fixed

- Bearer token charset and `printf` portability corrected in hook scripts
- `setup.sh` hook installation uses idempotent replace strategy instead of append, preventing duplicate entries on re-runs
- Comments added to `setup.sh` explaining `set -e` omission rationale and non-git cwd behaviour

## [Unreleased] - 2026-03-22

### Added

- Glob-scoped rule files in `.claude/rules/` replacing the monolithic `CLAUDE.md` (rules: `bridge-services.md`, `bridge-transport.md`, `database.md`, `design.md`, `ingestion.md`, `mcp-servers.md`, `skills.md`, `testing.md`, `ui.md`)
- Dockerized Serena LSP integration (`Dockerfile.serena`, `Dockerfile.serena-csharp`, `scripts/serena-docker` wrapper)
- Per-repo Serena config (`.serena/project.yml`) with TypeScript language settings and sensitive path exclusions
- Bootstrap skill Step 7: auto-generates `.serena/project.yml` with language detection
- `setup.sh` builds Serena Docker images, installs wrapper script, and registers MCP server globally
- `.claude/settings.json` with `disableBypassPermissionsMode` to prevent unsafe permissions bypass
- `.dockerignore` for Docker builds
- `.gitignore` entries for Serena runtime data, `settings.local.json`, and `coverage/`
- Adaptive statusline (`statusline.sh`) with context-first layout and five width tiers: FULL (>=116), MEDIUM (>=101), NARROW (>=78), COMPACT (>=65), COMPACT-S (<65)
- Separate Usage (5h/7d rate limits) and Context columns in the statusline display
- Mid-session terminal resize detection via hooks registered in `settings.json` (`PreToolUse`/`PostToolUse`/`Stop`)
- Statusline installation integrated into `setup.sh`
- `statusLine` config block added to `settings.json`

### Changed

- `CLAUDE.md` trimmed to under 80 lines — now a navigation document with a pointer to `.claude/rules/`; skill count and add-skill steps corrected
- Updated bootstrap skill (`bootstrap/SKILL.md`) to generate `.claude/rules/` directories and route `RULES_OK` audits correctly; hardened `RULES_OK` check to require non-empty `.claude/rules/` directory
- Replaced stale `@xenova/transformers` package reference with `@huggingface/transformers` across documentation
- Removed MCP server table from all skill preambles (centralized in `.claude/rules/mcp-servers.md`)
- Removed all `/* v8 ignore */` annotations from source files — coverage must be earned through real tests
- Dropped 100% coverage threshold enforcement from vitest.config.ts in both packages
- Updated TESTING.md, ARCHITECTURE.md, and CLAUDE.md to document prohibition on v8 ignore annotations

### Fixed

- Corrected inaccurate rule file content found during multiple review passes
- `project_name` field and bootstrap Step 7 clarifications in `.serena/project.yml`
- Docker infrastructure: opt-in C# build, removed port exposure, granular volume mounts, `--pull` flag, `.dockerignore`
- Documented `dotnet-install.sh` trust model and version pinning rationale
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
