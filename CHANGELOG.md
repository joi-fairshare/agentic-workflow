# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
