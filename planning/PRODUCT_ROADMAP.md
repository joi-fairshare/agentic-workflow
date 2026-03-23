# Product Roadmap

## v1.0 — Current Release

### Scope

The initial release provides three core capabilities:

1. **Skills Archive** — Five Claude Code custom skills (`/review`, `/postReview`, `/addressReview`, `/enhancePrompt`, `/bootstrap`) version-controlled and installable via symlink. Configuration archive for `settings.json` and `mcp.json`.

2. **Bootstrap Skill** — Repo documentation generator that detects which of 17 Pivot-pattern documents exist, generates missing ones adapted to the target repo's tech stack, and creates a `CLAUDE.md` if none exists.

3. **MCP Bridge** — TypeScript MCP server for bidirectional multi-agent communication with five tools (`send_context`, `get_messages`, `get_unread`, `assign_task`, `report_status`). Dual transport: MCP stdio for Claude Code integration and Fastify REST API on port 3100. SQLite store-and-forward persistence with WAL mode.

### Success Criteria

- [x] One-command setup via `./setup.sh` that symlinks skills, copies config, and installs npm dependencies
- [x] MCP server registers with Claude Code via `claude mcp add`
- [x] REST API starts on loopback with safety check for non-loopback binding
- [x] Full end-to-end type safety with `AppResult<T>` pattern (services never throw)
- [x] Atomic transactions for multi-step operations (assign_task, report_status, get_unread)
- [x] `/review` skill spawns parallel domain-specific reviewers and produces structured JSON output
- [x] TypeScript strict mode, declaration maps, and source maps enabled

### Timeline

Delivered. Current state of the repository.

---

## v1.5 — Full Development Lifecycle Skills

### Scope

Expand from 5 to 14 skills covering the entire development lifecycle, add a centralized output directory for cross-skill artifact sharing, and establish a shared preamble with bootstrap gate.

**1. Nine New Skills (ported from Gstack, rewritten)**

| Skill | Category | Purpose |
|-------|----------|---------|
| `/rootCause` | Investigation | 4-phase systematic debugging with module boundary scope freeze |
| `/bugHunt` | QA | Fix-and-verify loop with 3 tiers, atomic commits, regression tests |
| `/bugReport` | QA | Read-only health audit with weighted health scores |
| `/shipRelease` | Release | Sync, test, coverage audit, push, open PR, auto-invoke /syncDocs |
| `/syncDocs` | Release | Post-ship doc updater for README, ARCHITECTURE, CHANGELOG, CLAUDE.md, .claude/rules/ |
| `/weeklyRetro` | Retrospective | Per-person breakdowns, shipping streaks, test health, insights |
| `/officeHours` | Planning | YC-style brainstorming with 6 forcing questions → design doc |
| `/productReview` | Planning | Founder/product lens review with 4 modes (mvp/growth/scale/pivot) |
| `/archReview` | Planning | Engineering architecture review with mandatory diagrams |

**2. Centralized Output Directory**

All skill outputs write to `~/.agentic-workflow/<repo-slug>/` with subdirectories: `reviews/`, `investigations/`, `qa/`, `plans/`, `releases/`, `retros/`. Replaces the project-local `.review-cache/` pattern. Persists across sessions and branches.

**3. Shared Preamble with Bootstrap Gate**

Every skill includes a shared preamble that lists all 14 skills, points to the centralized output directory, and checks bootstrap status. If not bootstrapped, prompts user to run `setup.sh`.

**4. Existing Skill Updates**

- `/review` — migrated to centralized output dir, added SQL safety checks and LLM trust boundary analysis to triage
- `/postReview` — migrated to centralized output dir
- `/addressReview` — migrated to centralized output dir

**5. Infrastructure Updates**

- `setup.sh` — symlinks all 14 skills, creates `~/.agentic-workflow/` base directory
- `/bootstrap` — references full 14-skill inventory, suggests pipeline skills as next steps
- `CLAUDE.md` + `.claude/rules/` — trimmed CLAUDE.md (navigation only) + glob-scoped rule files for domain-specific guidance
- `ARCHITECTURE.md` — updated directory tree, mermaid diagram, component descriptions, key rules

### Success Criteria

- [x] All 14 skills have consistent shared preamble with bootstrap gate
- [x] Zero telemetry code in any skill
- [x] All outputs write to `~/.agentic-workflow/<repo-slug>/` with correct subdirectories
- [x] Existing `/review` → `/postReview` → `/addressReview` chain works with new paths
- [x] All skills follow SKILL.md format with proper YAML frontmatter
- [x] Verbose camelCase naming throughout
- [x] `setup.sh` updated with all new skill symlinks and output directory creation
- [x] `/bootstrap` references full 14-skill inventory
- [x] `CLAUDE.md` + `.claude/rules/` reflect complete architecture with all skills and output directory
- [x] `ARCHITECTURE.md` has updated directory tree, mermaid diagram, and key rules

### Timeline

Delivered.

---

## v1.1 — Quality and Developer Experience

### Scope

Improvements identified from code review and gap analysis of the current implementation.

**1. API Pagination**
Add `limit` and `offset` query parameters to `get_messages`, `get_unread`, and `getTasksByConversation`. Conversations with high message volume currently return unbounded result sets. The SQLite queries already support `ORDER BY created_at ASC` — adding `LIMIT`/`OFFSET` clauses and returning a `{ data, total, hasMore }` envelope is straightforward.

**2. Response Validation**
The REST API validates inputs with Zod but does not validate outputs. Each `RouteSchema` already has a `response` field — wire it into `registerRoute` so that outbound payloads are parsed against the response schema in development mode (skip in production for performance). This catches schema drift between services and controllers.

**3. ESLint and Prettier**
No linter or formatter is currently configured. Add `eslint` with `@typescript-eslint/parser` and `prettier` with a shared config. Add `npm run lint` and `npm run format` scripts. Enforce consistent code style across contributions.

**4. CI/CD Pipeline**
No continuous integration exists. Add a GitHub Actions workflow that runs on pull requests:
- `npm run typecheck` — TypeScript compilation check
- `npm run lint` — ESLint
- `npm run test` — Vitest
- Build verification (`npm run build`)

**5. Test Coverage Expansion**
The current test suite exists but coverage of edge cases is unknown. Add tests for:
- Transaction rollback on failure in `assign_task` and `report_status`
- Concurrent message reads in `get_unread` (mark-as-read atomicity)
- Zod validation error formatting in the REST API
- MCP tool error responses

**6. Error Logging and Observability**
The Fastify logger is enabled but services do not log. Add structured logging to service functions for debugging multi-agent workflows — particularly useful when tracing message flow between agents.

### Success Criteria

- [ ] All list endpoints support pagination with `limit`/`offset` parameters
- [ ] Response validation runs in development mode without performance impact in production
- [ ] ESLint and Prettier pass with zero warnings on the entire codebase
- [ ] CI pipeline runs on every PR and blocks merge on failure
- [ ] Test coverage reaches 80%+ for application services
- [ ] Structured logs trace message flow across conversations

### Timeline

Estimated 2-4 weeks of focused development. Each item is independent and can be delivered incrementally. Recommended order: ESLint/Prettier first (establishes standards for subsequent work), then CI/CD, then pagination, then response validation, then tests, then logging.

---

## v2.0 — Platform Expansion

### Scope

Extend from a bridge utility into a broader multi-agent development platform.

**1. Additional MCP Tools**

Expand the MCP tool surface beyond messaging and task management:

- `list_conversations` — Return all conversation UUIDs with metadata (message count, last activity, participants). Currently, an agent must know a conversation UUID to interact with it.
- `search_messages` — Full-text search across message payloads. Useful for agents reviewing historical context.
- `delete_conversation` — Clean up completed workflows. Currently, data accumulates indefinitely in the SQLite database.
- `get_task_tree` — Return tasks with their status reports as a nested structure, showing the full lifecycle of a task assignment.
- `subscribe_updates` — Long-poll or SSE endpoint for real-time notification when new messages arrive for an agent, eliminating the need to poll `get_unread`.

**2. Web Dashboard for Conversations**

Build a lightweight web UI for observing multi-agent workflows:

- Conversation timeline view showing messages between agents with sender/recipient labels
- Task board view (kanban-style) showing tasks by status (pending, in_progress, completed, failed)
- Live updates via SSE from the Fastify server
- Read-only by default — no write operations from the UI to avoid interfering with agent workflows
- Built with vanilla HTML/CSS/JS or a minimal framework (no heavy SPA framework) to keep the dependency footprint small

Technology considerations: Since the REST API already exists, the dashboard is a static frontend that consumes the existing endpoints. Could be served from Fastify as static files or run separately.

**3. Multi-Model Support**

The current implementation is model-agnostic at the protocol level (MCP and REST are not Claude-specific), but the skills and documentation assume Claude Code and Codex. Extend support to:

- **OpenAI Codex** — Already partially supported via the MCP bridge. Document the integration pattern.
- **Gemini CLI** — If/when Google ships MCP support, add configuration templates.
- **Local models (Ollama, LM Studio)** — Document how to connect local models as agents via the REST API.
- **Agent identity registry** — Formalize agent identifiers beyond free-form strings. Add an `agents` table tracking registered agents with capabilities, model type, and availability status.

**4. Skill Marketplace Integration**

The setup script references plugin marketplaces (`claude-plugins-official`, `voltagent-subagents`, `compound-engineering-plugin`). Build deeper integration:

- Skill discovery and installation from community repositories
- Skill versioning and update mechanism
- Dependency declaration between skills (e.g., `/addressReview` depends on `/review`)

### Success Criteria

- [ ] At least 3 new MCP tools shipped and documented
- [ ] Web dashboard displays live conversation data from the bridge
- [ ] At least one non-Claude agent successfully communicates through the bridge
- [ ] Agent identity registry replaces free-form sender/recipient strings
- [ ] Skill installation supports remote repositories beyond local symlinks

### Timeline

Estimated 2-3 months. This is a significant scope expansion and should be broken into sub-releases:

- v2.0-alpha: Additional MCP tools + conversation listing (2-3 weeks)
- v2.0-beta: Web dashboard MVP with conversation timeline (3-4 weeks)
- v2.0-rc: Multi-model documentation and agent registry (2-3 weeks)
- v2.0: Skill marketplace integration and polish (2-3 weeks)
