---
name: officeHours
description: "Spec-driven brainstorming session with EARS-format requirements. Outputs domain-specific docs (product.md, engineering.md, design-brief.md, TASKS.md) to plans/ directory — each assignable to its owning team."
argument-hint: "[feature-or-problem-description]"
allowed-tools: Bash(git *), Agent, Read, Write, Glob, Grep, Skill, WebFetch
---

# Office Hours — Spec-Driven Brainstorming

Runs a structured brainstorming session and produces four domain-owned outputs — one per team — so every participant leaves with a clear assignment rather than a monolithic doc no one owns.

<!-- === PREAMBLE START === -->

> **Agentic Workflow** — 34 skills available. Run any as `/<name>`.
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
>
> **Output directory:** `~/.agentic-workflow/<repo-slug>/`

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
for s in review postReview addressReview enhancePrompt bootstrap rootCause bugHunt bugReport shipRelease syncDocs weeklyRetro officeHours productReview archReview design-analyze design-analyze-web design-analyze-ios design-language design-evolve design-evolve-web design-evolve-ios design-mockup design-mockup-web design-mockup-ios design-implement design-implement-web design-implement-ios design-refine design-verify design-verify-web design-verify-ios verify-app verify-web verify-ios; do
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

## Step 1: Get the Topic

**If an argument was provided**, use it as the feature/problem description.

**If no argument was provided**, ask the user:
> "What feature, problem, or idea do you want to brainstorm?"

Wait for their response before continuing.

## Step 2: Context Gathering

Read project context to ground the brainstorming session:

- Read `CLAUDE.md` if it exists
- Read `README.md` if it exists
- **Read bootstrap-generated planning docs** — check `planning/` for existing product context and read whichever of these exist:
  - `planning/PRODUCT_ROADMAP.md` — existing product roadmap and priorities
  - `planning/BUSINESS_PLAN.md` — business model, target users, monetization
  - `planning/GO_TO_MARKET.md` — target segments, launch strategy
  - `planning/COMPETITIVE_ANALYSIS.md` — market landscape, positioning
  - `planning/ARCHITECTURE.md` — current technical architecture
  - Any other relevant docs in `planning/`
- Use Glob to find any other relevant planning docs (`docs/*.md`, `*.md` at root)
- Skim the most relevant files to understand the project's current state

**If product planning docs exist** (`PRODUCT_ROADMAP.md`, `BUSINESS_PLAN.md`, etc.), use them to pre-populate Q1 and Q2 context. Before asking Q1, summarize what the existing docs say about the topic: *"I found existing planning docs — here's what they say about [topic]: [summary]. Does this give us useful starting context, or is there a gap this feature addresses that the docs don't capture?"*

**External reference docs:** Scan each planning doc for an `## External References` section — the bootstrap skill appends these when `--product-docs` sources were provided. Collect all referenced sources across all docs, deduplicate by URL/path, and surface them before the first question:

> **External reference docs available:**
> - [SharePoint] [Roadmap Q1 2026](https://...) — Product priorities and timelines *(from PRODUCT_ROADMAP.md)*
> - [File] `~/docs/strategy.pdf` — Strategic direction *(from BUSINESS_PLAN.md)*
> - [Confluence] [PRD: Feature X](https://...) — ⚠️ Not accessible at bootstrap time *(from GO_TO_MARKET.md)*
>
> Should I consult any of these during our session? (yes / no / specify which)

If the user says yes (or specifies sources), fetch accessible URLs via WebFetch and read accessible local files before Q1 — treat their content as additional grounding context alongside the planning docs. Note sources marked `⚠️ Not accessible` but do not attempt to fetch them. If no `## External References` sections are found across any planning doc, skip this block entirely.

## Step 3: Problem & User Discovery

Work through each question sequentially. For each one, present your analysis based on the project context, then pause and wait for the user's response before moving on. This is a conversation -- do not use AskUserQuestion, just present each question naturally and wait.

### Q1: What problem are you solving?

Restate the problem in your own words based on what the user described and what you learned from the codebase. Be specific.

Then ask: **"Is this right, or is there a deeper issue?"**

Wait for the user's response.

### Q2: Who has this problem and when?

Based on the project and the problem, identify the specific user persona who experiences this. Analyze what they are doing when the problem surfaces -- look for specific triggers (events that kick it off) and ongoing conditions (states they find themselves in).

Then ask: **"Who experiences this, and what are they doing when it happens? Are there specific triggers (events) or ongoing conditions (states) that bring the problem to the surface?"**

Wait for the user's response.

### Q3: How do they solve it today, and what goes wrong?

Map the current workaround or status quo. Look at existing code, docs, or patterns that relate to this problem. Describe the current flow, and identify failure modes and unwanted behaviors.

Then ask: **"What's the current flow? What failure modes or unwanted behaviors do they hit?"**

Wait for the user's response.

### Q4: What does the ideal experience feel like?

Based on the problem and user from Q1-Q2, describe what a great interaction with this feature would feel like — not what it looks like, but what the user *feels* (fast, confident, effortless, informed, etc.). Identify the key moments in the flow that will make or break that feeling.

Then ask: **"What's the most important interaction to get right? What would make this feel delightful vs. just functional?"**

Wait for the user's response.

## Step 4: EARS Menu

After Q3, present the EARS requirement types as a menu. Pre-select types based on the Q1-Q3 conversation:

- **Ubiquitous** is always pre-selected (every feature has core "shall" requirements)
- **Event-driven** is pre-selected if Q2 revealed specific triggers
- **State-driven** is pre-selected if Q2 revealed ongoing conditions
- **Optional** is pre-selected if the feature involves conditional behavior, roles, or configurations
- **Unwanted** is pre-selected if Q3 revealed failure modes

Present the menu:

> Now let's structure the requirements for this feature. EARS (Easy Approach to Requirements Syntax) gives us five requirement patterns. Based on our conversation so far, I've pre-selected the types that seem most relevant, but you can adjust.
>
> **Requirement Types:**
>
> | # | Type | Pattern | Example | Selected? |
> |---|------|---------|---------|-----------|
> | 1 | **Ubiquitous** | "The [system] shall [action]" | "The API shall return JSON responses" | Yes |
> | 2 | **Event-driven** | "When [event], the [system] shall [action]" | "When a file is uploaded, the system shall scan for viruses" | {Yes/No based on Q2} |
> | 3 | **State-driven** | "While [state], the [system] shall [action]" | "While offline, the app shall queue sync operations" | {Yes/No based on Q2} |
> | 4 | **Optional** | "Where [condition], the [system] shall [action]" | "Where the user has admin role, the UI shall show the settings panel" | {Yes/No based on context} |
> | 5 | **Unwanted** | "If [unwanted condition], the [system] shall [action]" | "If the database is unreachable, the system shall return cached data" | {Yes/No based on Q3} |
>
> **Which types apply to your feature? (e.g., "1, 2, 5" or "all" or "drop 3")**

Wait for the user's response. Parse their selection (numbers, "all", or "drop N" syntax).

## Step 5: EARS Deep Dive

For each selected EARS type, run a focused sub-question. Present draft requirements based on the conversation so far and ask the user to refine them.

### 5a: Ubiquitous Requirements (always runs)

Present 3-5 draft ubiquitous requirements that capture the core "shall" behaviors.

Then ask: **"Here are the core behaviors I've drafted. What's missing? What can we cut to keep the MVP tight?"**

Wait for the user's response. Refine the list based on their feedback.

### 5b: Event-driven Requirements (if selected)

Present 2-3 draft event-driven requirements based on triggers identified in Q2.

Then ask: **"Are these the right triggers? Are there events I'm missing, or events that should be deferred to v2?"**

Wait for the user's response.

### 5c: State-driven Requirements (if selected)

Present 2-3 draft state-driven requirements based on conditions identified in Q2.

Then ask: **"Are these the right states to handle? Any states where the system should behave differently that we haven't covered?"**

Wait for the user's response.

### 5d: Optional Requirements (if selected)

Present 2-3 draft optional requirements based on conditional behavior identified in context.

Then ask: **"Are these the right conditions? Which of these are MVP vs. future?"**

Wait for the user's response.

### 5e: Unwanted Behavior Requirements (if selected)

Present 2-3 draft unwanted-behavior requirements based on failure modes from Q3.

Then ask: **"Are these the right failure scenarios? What's the worst thing that could happen, and how should the system respond?"**

Wait for the user's response.

### 5f: Approach (always runs)

Based on the codebase, tech stack, existing infrastructure, and the requirements gathered so far, present 2-3 concrete approach options that leverage existing strengths.

Then ask: **"Which of these resonates? Is there something I'm missing about your position?"**

Wait for the user's response.

### 5g: Success Criteria (always runs)

Present 2-3 derived acceptance criteria from the requirements gathered so far. Distinguish between leading indicators (can measure in days) and lagging indicators (takes weeks).

Then ask: **"How will we know this works? What would you measure, and when would you check?"**

Wait for the user's response.

## Step 6: Generate Four Domain-Owned Output Files

Synthesize the entire conversation into four radically focused files — one per domain. Each file is a standalone artifact with ZERO crossover.

**Ownership principle:** If you need to read another domain's doc to understand your own, the separation has failed.

**Content rules:**
- **product.md** — User perspective only. No technical details, no architecture, no implementation approaches. Product owns "what" and "why" from the user's perspective.
- **engineering.md** — Technical perspective only. No user personas, no business metrics, no UX goals. Engineering owns "how" from a system perspective.
- **design-brief.md** — Experience perspective only. No technical constraints, no architecture details. Design owns "what does this feel like" from the user's emotional perspective.
- **TASKS.md** — Task breakdown only. No implementation details (those live in domain docs). Tasks point to domain docs via references.

**Cross-references:** Each doc ends with a "Cross-References" section pointing to the other domain docs. This is the ONLY place where docs acknowledge each other.

### product.md — Owner: Product

```markdown
# Product: {feature}

_Generated by `/officeHours` on {ISO date}_
_Owner: Product Team_

## Problem Statement

**Who:** {User persona from Q2}
**What:** {Refined problem statement from Q1}
**When:** {Triggers and conditions from Q2}

**Current Experience:**
{How users solve this today — from Q3, user perspective only}

**Desired Experience:**
{What the ideal interaction feels like — from Q4, user perspective only}

## Requirements

_Written in [EARS format](https://alistairmavin.com/ears/) (Easy Approach to Requirements Syntax). Requirements describe user-facing behavior — what the system does from the user's perspective, not how it's implemented._

### Ubiquitous
- REQ-U1: The system shall [user-visible behavior]
- REQ-U2: The system shall [user-visible behavior]
- ...

### Event-driven
- REQ-E1: When [user action or external event], the system shall [user-visible response]
- ...

### State-driven
- REQ-S1: While [user or system state], the system shall [user-visible behavior]
- ...

### Optional
- REQ-O1: Where [user context or configuration], the system shall [user-visible behavior]
- ...

### Unwanted
- REQ-W1: If [error or edge case], the system shall [user-visible recovery behavior]
- ...

## MVP Scope

**In Scope (v1):**
- {User-facing feature 1}
- {User-facing feature 2}

**Out of Scope (future):**
- {Deferred user-facing feature 1}
- {Deferred user-facing feature 2}

## Acceptance Criteria

_Each criterion must be testable by the product team (no internal system checks)._

- **AC-1:** When [user does X], [observable outcome Y] happens within [timeframe]
- **AC-2:** {User-observable criterion}
- ...

## Success Metrics

_How we'll measure whether this solves the problem._

| Metric | Target | Timeframe | Owner |
|--------|--------|-----------|-------|
| {User behavior metric} | {target} | {when} | Product |
| {Business outcome metric} | {target} | {when} | Product |

## Traceability

| Requirement | Acceptance Criteria | Success Metric |
|------------|-------------------|----------------|
| REQ-U1 | AC-1 | {metric} |
| REQ-E1 | AC-2 | {metric} |

---

## Cross-References

- **Engineering Design:** `engineering.md` (technical approach, architecture decisions)
- **Design Brief:** `design-brief.md` (key interactions, experience goals)
- **Tasks:** `TASKS.md` (breakdown, dependencies)
```

**Sections for unselected EARS types are omitted entirely** (not shown as empty). The **Traceability table** links each requirement to at least one acceptance criterion.

### engineering.md — Owner: Engineering

```markdown
# Engineering Design: {feature}

_Generated by `/officeHours` on {ISO date}_
_Owner: Engineering Team_

## Technical Context

**Current System State:**
{Current implementation, tech stack, relevant components — from codebase analysis}

**Current Technical Limitations:**
{What the current system can't do that this feature requires — from Q3, engineering perspective only}

## Approach

**Selected Strategy:**
{Chosen technical approach from 5f conversation — how existing strengths are leveraged}

**Why This Approach:**
{Technical rationale — performance, maintainability, consistency with existing patterns}

**Integration Points:**
{Which existing systems/components this feature touches}

## Architecture Decisions

_Documented as lightweight ADRs (Architecture Decision Records)._

### ADR-1: {Decision title}
**Context:** {Technical context that led to this decision}
**Decision:** {What we decided}
**Rationale:** {Why — technical reasons only}
**Alternatives:** {What else we considered and why we rejected it}
**Consequences:** {What this decision enables and what it constrains}

### ADR-2: {Decision title}
...

## Technical Requirements

_Derived from product requirements but expressed as system-level constraints._

- **TR-1:** The system shall handle [technical constraint] — traces to [REQ-U1]
- **TR-2:** The system shall integrate with [component/service] — traces to [REQ-E1]
- ...

## Dependencies & Risks

**External Dependencies:**
- {Service, library, or API we depend on}
- {Another external system or team we need}

**Technical Risks:**
- {Performance risk — what could be slow}
- {Scaling risk — what breaks at high volume}
- {Security risk — what attack surface this creates}
- {Data risk — what could be lost or corrupted}

**Mitigation Strategies:**
{For each high-priority risk, how we plan to address it}

## Open Questions

_Technical uncertainties that need resolution before or during implementation._

- **Q-1:** {Technical question} — blocking: {yes/no} — owner: {name}
- **Q-2:** {Technical question} — blocking: {yes/no} — owner: {name}

---

## Cross-References

- **Product Requirements:** `product.md` (user-facing behavior, acceptance criteria)
- **Design Brief:** `design-brief.md` (key interactions to support)
- **Tasks:** `TASKS.md` (implementation breakdown)
```

### design-brief.md — Owner: Design

```markdown
# Design Brief: {feature}

_Generated by `/officeHours` on {ISO date}_
_Owner: Design Team_

## Experience Goals

**Desired Feeling:**
{What the ideal interaction feels like from Q4 — the emotional qualities to achieve}

Examples: Fast, confident, effortless, informed, delightful, reassuring, playful, professional, etc.

**Anti-Goals (what this should NOT feel like):**
{Opposite qualities we want to avoid — derived from failure modes in Q3}

Examples: Confusing, slow, tedious, opaque, overwhelming, etc.

## Key Moments to Design

_Ranked by importance — focus design effort on these interactions first._

### 1. {Interaction name}
**Why it matters:** {User impact}
**Current pain point:** {What goes wrong today — from Q3}
**Success looks like:** {Observable user behavior when this works well}

### 2. {Interaction name}
**Why it matters:** {User impact}
**Current pain point:** {What goes wrong today}
**Success looks like:** {Observable user behavior}

...

## UX Principles for This Feature

_Specific design principles derived from the requirements and experience goals._

- **Principle 1:** {Design principle} — Example: "Always show progress during long operations"
- **Principle 2:** {Design principle} — Example: "Defaults should work for 80% of users"
- ...

## Design Constraints

_What must be true for this design to succeed — usability constraints only, no technical details._

- **C-1:** Users must be able to [action] in [N] clicks or fewer — traces to [REQ-U1]
- **C-2:** Error messages must [usability requirement] — traces to [REQ-W1]
- **C-3:** The interface must support [accessibility requirement] — traces to [REQ-U2]
- ...

## Scope Boundaries

**In Scope for Design:**
- {Interaction or screen to design}
- {Another interaction or screen}

**Out of Scope (future design work):**
- {Deferred interaction}
- {Deferred screen}

## Design Language

**Tokens & Patterns:**
{If design-tokens.json / .impeccable.md exist, reference them here}

Path: `design-tokens.json`, `.impeccable.md`

**Relevant Tokens for This Feature:**
- Colors: {e.g., "accent color for primary actions"}
- Typography: {e.g., "monospace for data display"}
- Spacing: {e.g., "s4 for card padding"}
- Motion: {e.g., "150ms ease for state transitions"}

**Existing Patterns to Reuse:**
{If pattern discovery has run, reference discovered containers/providers/components}

---

## Cross-References

- **Product Requirements:** `product.md` (user-facing behavior, acceptance criteria)
- **Engineering Design:** `engineering.md` (technical approach — coordinate on integration points)
- **Tasks:** `TASKS.md` (design task breakdown)
```

### TASKS.md — Owner: Engineering (cross-team visibility)

```markdown
# Tasks: {feature}

_Generated by `/officeHours` on {ISO date}_
_Owner: Engineering Team — visible to all teams_

## Task Breakdown

_Tasks are ordered by dependency graph (topological sort). Each task points to its domain doc for implementation details._

---
id: TASK-1
domain: engineering
depends: []
complexity: small
reqs: [REQ-U1]
owner: unassigned
status: todo
---
## TASK-1: {title}

**What:** {One-sentence description of the task}
**Why:** {Which requirement(s) this implements}
**Definition of Done:** {Observable completion criteria}
**Reference:** See `engineering.md` [section or ADR] for implementation details

---
id: TASK-2
domain: design
depends: []
complexity: medium
reqs: [REQ-U1, REQ-E1]
owner: unassigned
status: todo
---
## TASK-2: {title}

**What:** {One-sentence description}
**Why:** {Which requirement(s) this implements}
**Definition of Done:** {Observable completion criteria — e.g., "mockup approved by product"}
**Reference:** See `design-brief.md` [section] for experience goals and constraints

---
id: TASK-3
domain: engineering
depends: [TASK-1, TASK-2]
complexity: large
reqs: [REQ-U2, REQ-E1]
owner: unassigned
status: blocked
---
## TASK-3: {title}

**What:** {One-sentence description}
**Why:** {Which requirement(s) this implements}
**Definition of Done:** {Observable completion criteria}
**Reference:** See `engineering.md` [section or ADR] for implementation details

...

## Task Summary

| Domain | Count | Complexity Breakdown |
|--------|-------|----------------------|
| Engineering | {N} | {e.g., "2 small, 3 medium, 1 large"} |
| Design | {N} | {e.g., "1 medium, 1 large"} |
| Product | {N} | {e.g., "1 small"} |

**Total Estimated Effort:** {e.g., "~18 hours (engineering), ~8 hours (design), ~1 hour (product)"}

## Dependency Graph

```mermaid
graph TD
  TASK-1[TASK-1: {title}]
  TASK-2[TASK-2: {title}]
  TASK-3[TASK-3: {title}]

  TASK-1 --> TASK-3
  TASK-2 --> TASK-3
```

---

## Cross-References

- **Product Requirements:** `product.md` (requirements that tasks implement)
- **Engineering Design:** `engineering.md` (implementation details for engineering tasks)
- **Design Brief:** `design-brief.md` (experience goals and constraints for design tasks)
```

Task guidelines:
- Order tasks by dependency graph (topological sort)
- Complexity values: `small` (< 1 hour), `medium` (1-4 hours), `large` (4+ hours)
- The `domain` field is `engineering`, `design`, or `product`
- The `reqs` field traces each task back to one or more requirements
- Each task has `owner` (assigned name or "unassigned") and `status` (todo/in-progress/blocked/done)
- Each task should be atomic — one logical unit of work
- Task descriptions use "What/Why/Definition of Done/Reference" structure — NO implementation details in task body (those live in domain docs)

## Step 6.5: Dark Factory Spec Validation (if enabled)

**Start the pipeline** with the objective of finding criterion failures across the four docs:
```
mcp__prism-mcp__session_start_pipeline — project: REPO_SLUG,
  objective: "Adversarially evaluate these four spec docs for the '{feature}' feature. Check: (1) product.md contains no technical implementation details, (2) engineering.md contains no user personas or business metrics, (3) design-brief.md contains no technical constraints, (4) TASKS.md references domain docs rather than duplicating implementation details, (5) all selected EARS requirement types are present with at least 2 requirements each, (6) every product.md requirement traces to at least one acceptance criterion, (7) TASKS.md dependency graph is topologically sorted with no circular dependencies. For each failing criterion, provide file:line evidence.",
  working_directory: "<absolute path to plan output dir: ~/.agentic-workflow/$REPO_SLUG/plans/{timestamp}-{slug}/>",
  max_iterations: 2
```

Store the returned `pipeline_id`. Poll until complete:
```
mcp__prism-mcp__session_check_pipeline_status — pipeline_id: <pipeline_id>
```

When complete:
- `COMPLETED` — docs passed adversarial evaluation. Show: `Spec validated ✓` then proceed to Step 7.
- `FAILED` — surface the evaluator's findings with the specific criterion failures and `file:line` evidence. Ask the user:
  > "The adversarial evaluator flagged these issues: {findings}. Fix them before writing? (yes/no)"
  If yes: regenerate the flagged sections and re-run the pipeline once. If no: proceed to Step 7 anyway and note the issues in the report.

## Step 7: Write the Output Directory

Generate a URL-safe slug from the title (lowercase, hyphens, no special chars). Create the output directory and write all four files:

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$HOME/.agentic-workflow/$REPO_SLUG/plans/${TIMESTAMP}-{slug}"
```

Write the four files to:
- `$HOME/.agentic-workflow/$REPO_SLUG/plans/{timestamp}-{slug}/product.md`
- `$HOME/.agentic-workflow/$REPO_SLUG/plans/{timestamp}-{slug}/engineering.md`
- `$HOME/.agentic-workflow/$REPO_SLUG/plans/{timestamp}-{slug}/design-brief.md`
- `$HOME/.agentic-workflow/$REPO_SLUG/plans/{timestamp}-{slug}/TASKS.md`

## Step 8: Report

Show a summary to the user:

```
Office Hours complete!

Plan written to: ~/.agentic-workflow/{repo-slug}/plans/{timestamp}-{slug}/

  product.md       → Product Team     — {N} requirements, {N} acceptance criteria, {N} success metrics
  engineering.md   → Engineering Team — {N} ADRs, {N} technical requirements, {N} open questions
  design-brief.md  → Design Team      — {N} key moments, {N} UX principles, {N} design constraints
  TASKS.md         → All Teams        — {N} tasks ({e.g. "4 engineering, 2 design, 1 product"}) | Est. effort: {e.g. "~18h eng, ~8h design"}

Separation of Concerns:
  ✓ Zero crossover between domain docs
  ✓ Each doc is standalone (read only your domain's doc to get started)
  ✓ Cross-references point to other docs for coordination
  ✓ TASKS.md references domain docs for implementation details (no duplication)

Summary:
  Problem: {one-line problem statement from Q1}
  User: {persona from Q2}
  Experience Goal: {primary feeling from Q4}
  MVP: {one-line scope summary from product.md}
  Key Metric: {primary success metric from product.md}
  Approach: {one-line technical strategy from engineering.md}

Suggested next steps:
  /productReview       — Product: Get founder-lens feedback on requirements and scope
  /archReview          — Engineering: Review ADRs and technical approach
  /design-mockup       — Design: Start mockup from design-brief.md (run /design-language first if needed)
  /addressReview TASKS — Engineering: Start implementation (references engineering.md for details)
```

### Sub-skill Dispatch

Present naturally at the end of the session:
> "Plan is ready. Would you like a review? I can run an architectural review, a product review, or both."

Based on response:
- Architectural concerns → Skill tool: `archReview`
- Product/founder lens → Skill tool: `productReview`
- Both → invoke in sequence: `archReview` then `productReview`
- Neither → done
