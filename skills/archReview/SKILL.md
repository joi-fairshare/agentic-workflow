---
name: archReview
description: Engineering architecture review with mandatory diagrams and edge case analysis. Reviews plans or implementations for technical soundness.
argument-hint: "[--plan <path> | plan-file-or-directory-to-review] [--output <path>] [--slim]"
allowed-tools: Bash(git *), Bash(ls *), Bash(date *), Bash(mkdir *), Bash(SHARED_DIR=*), Agent, Read, Write, Glob, Grep, Skill, AskUserQuestion, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff
---

# Architecture Review — Engineering Lens

Reviews plans or implementations for technical soundness. Produces mandatory mermaid diagrams, edge case analysis, and a scored verdict.

<!-- === PREAMBLE START === -->

> **Agentic Workflow** — 44 native skills + 3 fetched external packs (impeccable, emil-design-eng, taste-skill family). Run any as `/<name>`.
>
> | Skill | Purpose |
> |-------|---------|
> | `/review` | Multi-agent PR code review |
> | `/postReview` | Publish review findings to GitHub |
> | `/addressReview` | Implement review fixes in parallel |
> | `/enhancePrompt` | Context-aware prompt rewriter |
> | `/bootstrap` | Generate repo planning docs + CLAUDE.md |
> | `/rootCause` | 4-phase systematic debugging |
> | `/bugHunt` | Fix-and-verify loop with regression tests |
> | `/bugReport` | Structured bug report with health scores |
> | `/shipRelease` | Sync, test, push, open PR |
> | `/syncDocs` | Post-ship doc updater |
> | `/weeklyRetro` | Weekly retrospective with shipping streaks |
> | `/officeHours` | Spec-driven brainstorming → EARS requirements + design doc |
> | `/productReview` | Founder/product lens plan review |
> | `/archReview` | Engineering architecture plan review |
> | `/withInterview` | Interview user to clarify requirements before executing |
> | `/design-analyze` | Detect web vs iOS, extract design tokens (dispatcher) |
> | `/design-analyze-web` | Extract design tokens from reference URLs (web) |
> | `/design-analyze-ios` | Extract design tokens from Swift/Xcode assets |
> | `/design-language` | Define brand personality and aesthetic direction |
> | `/design-evolve` | Detect web vs iOS, merge new reference into design language (dispatcher) |
> | `/design-evolve-web` | Merge new URL into design language (web) |
> | `/design-evolve-ios` | Merge Swift reference into design language (iOS) |
> | `/design-mockup` | Detect web vs iOS, generate mockup (dispatcher) |
> | `/design-mockup-web` | Generate HTML mockup from design language |
> | `/design-mockup-ios` | Generate SwiftUI preview mockup |
> | `/design-implement` | Detect web vs iOS, generate production code (dispatcher) |
> | `/design-implement-web` | Generate web production code (CSS/Tailwind/Next.js) |
> | `/design-implement-ios` | Generate SwiftUI components from design tokens |
> | `/design-refine` | Dispatch Impeccable refinement commands |
> | `/design-verify` | Detect web vs iOS, screenshot diff vs mockup (dispatcher) |
> | `/design-verify-web` | Playwright screenshot diff vs mockup (web) |
> | `/design-verify-ios` | Simulator screenshot diff vs mockup (iOS) |
> | `/verify-app` | Detect web vs iOS, verify running app (dispatcher) |
> | `/verify-web` | Playwright browser verification of running web app |
> | `/verify-ios` | XcodeBuildMCP simulator verification of iOS app |
> | `/autoplan` | Plan meta-orchestrator (productReview + archReview + planDesignReview + planDevexReview + cso in parallel) |
> | `/planDesignReview` | Design-lens review of plan docs |
> | `/planDevexReview` | DX-lens review of plan docs |
> | `/cso` | OWASP Top 10 + STRIDE threat model (plan or PR diff) |
> | `/design-shotgun` | Generate 4–6 mockup variants in parallel |
> | `/landAndDeploy` | Merge → deploy → smoke → chain canary |
> | `/canary` | Post-deploy monitoring with custom probes |
> | `/prismStatus` | Health check for prism-mcp |
> | `/specToProvenPR` | Approved spec → proven, review-clean PRs, one shippable stage at a time |
>
> **Output directory:** `~/.agentic-workflow/<repo-slug>/`
>
> ### Meta-Orchestration Convention
>
> Every native pipeline skill ends its response with a `## Next steps` block listing 1–3 recommended successor skills with one-line reasons. This is the meta-orchestration layer — skills hand off through structured suggestions, not by importing each other's logic. Three stage orchestrators (`/autoplan`, `/design-refine`, `/shipRelease`) fan out subagents in parallel and consolidate findings.

## Codebase Navigation

Prefer **Serena** for all code exploration — LSP-based symbol lookup is faster and more precise than file scanning.

| Task | Tool |
|------|------|
| Find a function, class, or symbol | `serena: find_symbol` |
| What references symbol X? | `serena: find_referencing_symbols` |
| Module/file structure overview | `serena: get_symbols_overview` |
| Search for a string or pattern | `Grep` (fallback) |
| Read a full file | `Read` (fallback) |

## Preamble — Bootstrap Check

Before running this skill, verify the environment is set up:

```bash
# Derive repo slug
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ -n "$REMOTE_URL" ]; then
  REPO_SLUG=$(echo "$REMOTE_URL" | sed 's|.*[:/]\([^/]*/[^/]*\)\.git$|\1|;s|.*[:/]\([^/]*/[^/]*\)$|\1|' | tr '/' '-')
else
  REPO_SLUG=$(basename "$(pwd)")
fi
echo "repo-slug: $REPO_SLUG"

# Check bootstrap status
SKILLS_OK=true
for s in review postReview addressReview enhancePrompt bootstrap rootCause bugHunt bugReport shipRelease syncDocs weeklyRetro officeHours productReview archReview withInterview design-analyze design-analyze-web design-analyze-ios design-language design-evolve design-evolve-web design-evolve-ios design-mockup design-mockup-web design-mockup-ios design-implement design-implement-web design-implement-ios design-refine design-verify design-verify-web design-verify-ios verify-app verify-web verify-ios autoplan planDesignReview planDevexReview cso design-shotgun landAndDeploy canary prismStatus specToProvenPR; do
  [ -d "$HOME/.claude/skills/$s" ] || SKILLS_OK=false
done

BRIDGE_OK=false
lsof -i TCP:3100 -sTCP:LISTEN &>/dev/null && BRIDGE_OK=true

RULES_OK=false
[ -d ".claude/rules" ] && [ -n "$(ls -A .claude/rules/ 2>/dev/null)" ] && RULES_OK=true

echo "skills-symlinked: $SKILLS_OK"
echo "bridge-running: $BRIDGE_OK"
echo "rules-directory: $RULES_OK"
```

Domain rules in `.claude/rules/` load automatically per glob — no action needed if `rules-directory: true`.

If `SKILLS_OK=false` or `BRIDGE_OK=false`, ask the user via AskUserQuestion:
> "Agentic Workflow is not fully set up. Run setup.sh now? (yes/no)"

If **yes**: run `bash <path-to-agentic-workflow>/setup.sh` (resolve path from the review skill symlink target).
If **no**: warn that some features may not work, then continue.

If `RULES_OK=false` (and `SKILLS_OK` and `BRIDGE_OK` are both true), do not offer setup.sh. Instead, show:
> "Domain rules not found — run `/bootstrap` to generate `.claude/rules/` for this repo."

Create the output directory for this repo:
```bash
mkdir -p "$HOME/.agentic-workflow/$REPO_SLUG"
```

## Session Context

Load prior work state for this repo from prism-mcp before starting.

**1. Derive a topic string** — synthesize 3–5 words from the skill argument and task intent:
- `/officeHours add dark mode` → `"dark mode UI feature"`
- `/rootCause TypeError cannot read properties` → `"TypeError cannot read properties"`
- `/review 42` → use the PR title once fetched: `"PR {title} review"`
- No argument → use the most specific descriptor available: `"{REPO_SLUG} {skill-name}"`

**2. Load context from prism-mcp:**
```
mcp__prism-mcp__session_load_context — project: REPO_SLUG, level: "standard",
  toolAction: "Loading session context", toolSummary: "<skill-name> context recovery"
```

Store the returned `expected_version` — you will need it at Session Close.

**3. Surface results:**
- If the response contains a non-empty summary or prior decisions:
  > **Prior context:** {summary}
  Use this to inform your approach before continuing.
- If prism-mcp returns an error, surface it and stop:
  > "prism-mcp unavailable: {error}. Ensure prism-mcp is running and registered."

## Session Close

> **Run at the end of every skill**, after all work is complete and the report has been shown to the user.

Save a structured ledger entry and update the live handoff state for this repo.

**1. Save ledger entry (immutable audit trail):**
```
mcp__prism-mcp__session_save_ledger — project: REPO_SLUG,
  conversation_id: "<skill-name>-<ISO-timestamp, e.g. 2026-04-08T14:32:00Z>",
  summary: "<one paragraph describing what was accomplished this session>",
  todos: ["<any open items left incomplete>", ...],
  files_changed: ["<paths of files created or modified>", ...],
  decisions: ["<key decisions made during this skill run>", ...]
```

**2. Update handoff state (mutable live state for next session):**
```
mcp__prism-mcp__session_save_handoff — project: REPO_SLUG,
  expected_version: <value returned by session_load_context>,
  open_todos: ["<open items not yet completed>", ...],
  active_branch: "<current git branch from: git branch --show-current>",
  last_summary: "<one sentence: what this skill just did>",
  key_context: "<critical facts the next session must know — constraints, decisions, blockers>"
```

If either call fails, surface the error:
> "prism-mcp session save failed: {error}. Context may not persist to next session."

<!-- === PREAMBLE END === -->

## Step 1: Resolve the Target

**Parse flags first:** `--plan <path>` (equivalent to the positional path), `--output <path>` (explicit output file — `/autoplan` passes `--output <feature-dir>/arch-review.md`), `--slim` (compact output: matrix, scores, and verdict only).

**If a file path is given**, read that file as the plan/spec to review.

**If a directory is given** and it is a plan dir, read `plan.md` + `engineering.md` + `TASKS.md` — the reader matrix in `_shared/plan-layout.md`. Legacy aliases per `_shared/plan-layout.md`: fall back to `design.md` (→ engineering.md) and `requirements.md` (→ product.md) only if the canonical file is absent. If it is a code directory, explore its structure using Glob and Read.

**If nothing is given**, try two fallbacks in order:
1. Auto-discover the most recent plan per `_shared/plan-discovery.md`:
   ```bash
   SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/archReview/SKILL.md")")/../_shared"
   source "$SHARED_DIR/repo-slug.sh"
   PLAN_DIR=$(ls -1dt "$AW_DIR/plans/"*/ 2>/dev/null | head -1)
   ```
   Resolve a found plan dir per the reader matrix above; a legacy single `.md` file is read as-is.
2. If no plans exist, review the current project's architecture by exploring the repository root.

## Step 2: Read Context

Read all available architectural context:

- `CLAUDE.md` — project conventions and structure
- `planning/ARCHITECTURE.md` or `ARCHITECTURE.md` — existing architecture docs
- `planning/ERD.md` or `ERD.md` — data model
- `planning/API_CONTRACT.md` or `API_CONTRACT.md` — API surface
- `README.md` — project overview

Use Glob to discover these files -- do not assume paths.

## Step 3: Architecture Analysis

Dispatch one explore agent — `Agent` tool, `subagent_type: "Explore"`, search breadth "very thorough" — with this prompt:

> "Map the system at `<target>`. Read source files, configuration, and package manifests. Report, with file:line evidence for each: (1) component boundaries — a **named list** of distinct modules/services and where the boundaries are drawn; (2) dependency graph, including circular dependencies; (3) data flow paths — how data enters, transforms, exits; (4) external integrations; (5) state management — where state lives, how it syncs, source of truth; (6) error propagation across boundaries — handled or swallowed."

**Output contract:** the agent must return the named boundary list (it drives the Step 5 matrix rows) plus the six areas above. **Fallback:** if the Agent tool is unavailable or returns nothing usable, do the same exploration directly with `Glob` + `Grep` + `Read`, producing the same named boundary list.

## Step 4: Generate Mandatory Diagrams

Create three mermaid diagrams. These are **mandatory** -- the review is incomplete without them. Every diagram must satisfy two assertions:

- **≥3 nodes named after real components** from Step 3 (actual module, file, service, or table names — e.g. `mcp.ts`, `EventBus`, `bridge.db`)
- **No placeholder labels** — generic labels such as "Component A", "Service", "Input", "Transform", "Store" do not count; a diagram containing them is invalid and the review is incomplete.

### 4a: Component Diagram
Each module/service as a box with dependency arrows: internal components and responsibilities, external dependencies (databases, APIs, file system), direction of dependency.

### 4b: Data Flow Diagram
How data moves from entry to exit: input sources (user, API, file, event), transformation steps, storage points, output destinations.

### 4c: Sequence Diagram
The single most critical user flow end-to-end: all participants, request/response pairs, and the error path for the main flow.

## Step 5: Edge Case Matrix

Build a **boundary × failure-mode matrix** — one row per component boundary from Step 3's named list, one column per failure mode. Every cell is either a finding id (defined below the table) or `OK — <evidence>` (file:line, config value, or plan-line proving the case is handled). **No blank cells** — an unexamined cell is itself a finding. One covered boundary must never masquerade as full coverage.

| Boundary | Dependency unavailable | Invalid/malicious input | Load 10x | State leakage |
|---|---|---|---|---|
| {boundary 1} | F1 or `OK — <evidence>` | … | … | … |
| {…one row per Step-3 boundary…} | | | | |

Failure-mode definitions:
- **Dependency unavailable** — timeout? retry? fallback? does the failure cascade or is it contained?
- **Invalid / malicious input** — unexpected types, missing fields, oversized payloads; validation at the boundary or deep inside; injection vectors (SQL, command, path traversal)?
- **Load 10x** — first bottleneck (CPU, memory, I/O, connections); unbounded queues, caches, buffers?
- **State leakage** — cross-request/user leakage; shared mutable globals; guaranteed cleanup (connections, file handles, temp files)?

Findings (F1, F2, …): severity per `_shared/severity.md`, description, location, concrete mitigation.

## Step 5.5: Review Self-Check

Verify your own evidence: for every `OK — <evidence>` cell in the matrix, confirm the cited code actually exists via `Grep`/`Read` (grep the named timeout, validator, handler, or config key). Downgrade any cell whose evidence does not hold to a finding.

**Optional adversarial delegation:** per `_shared/dark-factory.md` (archReview review-gap objective template) — gate-checked there; skip silently when not enabled. Incorporate delegated findings into the matrix and Top Risks before writing the verdict.

## Step 6: Review Verdict

Produce the final assessment. The verdict is **rule-derived** from the matrix findings and scores (anchored 1–5 scale per `_shared/severity.md`):
- any CRITICAL finding, or any dimension scored 1 ⇒ **REDESIGN**
- any HIGH finding, or any dimension scored ≤2 ⇒ **NEEDS WORK**
- otherwise ⇒ **SOUND**

```markdown
# Architecture Review: {title}

_Reviewed by `/archReview` on {ISO date}_

## Verdict: {SOUND | NEEDS WORK | REDESIGN}

{One paragraph justification citing the finding ids / dimension scores that drove it}

## Scores

_Anchored 1–5 scale from `_shared/severity.md` (5 = no findings above LOW … 1 = CRITICAL or unaddressed)._

| Dimension | Score (1–5) | Notes |
|-----------|:---:|-------|
| Complexity | {n} | {brief justification} |
| Scalability | {n} | {brief justification} |
| Maintainability | {n} | {brief justification} |

## Component Diagram

{mermaid diagram from 4a}

## Data Flow Diagram

{mermaid diagram from 4b}

## Sequence Diagram

{mermaid diagram from 4c}

## Top Risks

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | {risk} | {high/med/low} | {high/med/low} | {recommendation} |
| 2 | {risk} | {high/med/low} | {high/med/low} | {recommendation} |
| ... | ... | ... | ... | ... |

## Edge Case Matrix

{the Step 5 boundary × failure-mode matrix, followed by its findings list — empty findings list is the literal `None.`}

## Missing Error Handling
- {specific location and what's missing}
- {specific location and what's missing}

## Suggested Improvements (Prioritized)

_Severity per `_shared/severity.md` (legacy P0→CRITICAL, P1→HIGH)._

| Severity | Improvement | Effort | Impact |
|----------|------------|--------|--------|
| CRITICAL | {must fix before shipping} | {S/M/L} | {description} |
| HIGH | {should fix soon} | {S/M/L} | {description} |
| MEDIUM/LOW | {nice to have} | {S/M/L} | {description} |
```

End the file with the normalized final line per `_shared/severity.md` (CD9 mapping: SOUND→PASS, NEEDS WORK→NEEDS_WORK, REDESIGN→BLOCKED):

```
verdict: <PASS|NEEDS_WORK|BLOCKED>
```

## Step 7: Write the Review

If `--output <path>` was provided, write to that exact path (ensure the parent dir exists with `mkdir -p`). Otherwise generate a URL-safe slug from the target title (lowercase, hyphens, no special chars) and write to the default path:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/archReview/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
```

Default: `$AW_DIR/plans/{timestamp}-arch-review-{slug}.md`

Include all three mermaid diagrams and the complete analysis.

## Step 8: Report

Show a summary to the user:

```
Architecture Review complete!

Verdict: {SOUND | NEEDS WORK | REDESIGN} (normalized: {PASS | NEEDS_WORK | BLOCKED})

Scores:
  Complexity:      {n}/5
  Scalability:     {n}/5
  Maintainability: {n}/5

Review written to: {resolved output path}

Top 3 risks:
  1. {risk summary}
  2. {risk summary}
  3. {risk summary}

Suggested next steps:
  /productReview — Get founder-lens feedback on the plan
  /officeHours — Brainstorm solutions to identified risks
```

## Next steps

- `/autoplan` — run alongside other plan-review lenses in parallel
- `/review` — deep code review of the implementation
