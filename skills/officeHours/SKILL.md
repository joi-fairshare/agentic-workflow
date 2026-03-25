---
name: officeHours
description: "Spec-driven brainstorming session with EARS-format requirements. Outputs domain-specific docs (product.md, engineering.md, design-brief.md, TASKS.md) to plans/ directory — each assignable to its owning team."
argument-hint: "[feature-or-problem-description]"
disable-model-invocation: true
allowed-tools: Bash(git *), Agent, Read, Write, Glob, Grep, Skill
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
> | `/officeHours` | Spec-driven brainstorming → product + engineering + design-brief + tasks |
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

## Memory Recall

> **Skip if** this skill is marked `<!-- MEMORY: SKIP -->`, or if `BRIDGE_OK=false`.

Check for prior discussion context in memory before reading the codebase.

**1. Derive a topic string** — synthesize 3–5 words from the skill argument and task intent:
- `/officeHours add dark mode` → `"dark mode UI feature"`
- `/rootCause TypeError cannot read properties` → `"TypeError cannot read properties"`
- `/review 42` → use the PR title once fetched: `"PR {title} review"`
- No argument → use the most specific descriptor available: `"{REPO_SLUG} {skill-name}"`

**2. Search memory:**
```
mcp__agentic-bridge__search_memory — query: <topic>, repo: REPO_SLUG, mode: "hybrid", limit: 10
```

**3. Assemble context:**
```
mcp__agentic-bridge__get_context — query: <topic>, repo: REPO_SLUG, token_budget: 2000
```
(Use `token_budget: 1000` for `/review` and `/addressReview`.)

**4. Surface results:**
- If `get_context` returns a non-empty summary or any section with `relevance > 0.3`:
  > **Prior context:** {summary} *(~{token_estimate} tokens)*
  Use this to inform your approach before continuing.
- If empty, all low-relevance, or any tool error: continue silently — do not mention the search.

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
- Use Glob and Grep to find any relevant planning docs (`planning/*.md`, `docs/*.md`)
- Skim the most relevant files to understand the project's current state

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

Synthesize the entire conversation into four files — one per domain. Each file is a standalone artifact with a clear owner who can take it directly into their next meeting or workstream.

### product.md — Owner: Product

```markdown
# Product: {feature}

_Generated by `/officeHours` on {ISO date}_
_Owner: Product_

## Problem Statement
{Refined problem statement from Q1 conversation}

## Target User
{User persona, triggers, and conditions from Q2 conversation}

## Requirements

_Written in [EARS format](https://alistairmavin.com/ears/) (Easy Approach to Requirements Syntax). Each requirement uses a typed prefix: REQ-U (ubiquitous), REQ-E (event-driven), REQ-S (state-driven), REQ-O (optional), REQ-W (unwanted behavior)._

### Ubiquitous
- REQ-U1: The [system] shall [action]
- REQ-U2: The [system] shall [action]
- ...

### Event-driven
- REQ-E1: When [event], the [system] shall [action]
- ...

### State-driven
- REQ-S1: While [state], the [system] shall [action]
- ...

### Optional
- REQ-O1: Where [condition], the [system] shall [action]
- ...

### Unwanted
- REQ-W1: If [unwanted condition], the [system] shall [action]
- ...

## MVP Scope

### In Scope
- {feature 1}
- {feature 2}

### Out of Scope (deferred)
- {deferred item 1}
- {deferred item 2}

## Acceptance Criteria
- AC-1: {derived from requirements, measurable}
- AC-2: ...

## Success Metrics
| Metric | Target | Timeframe |
|--------|--------|-----------|
| {metric} | {target} | {when} |

## Traceability
| Requirement | Acceptance Criteria |
|------------|-------------------|
| REQ-U1 | AC-1 |
| REQ-E1 | AC-2 |
| ... | ... |
```

**Sections for unselected EARS types are omitted entirely** (not shown as empty). The **Traceability table** links each requirement to at least one acceptance criterion.

### engineering.md — Owner: Engineering

```markdown
# Engineering Design: {feature}

_Generated by `/officeHours` on {ISO date}_
_Owner: Engineering_

## Current State
{Current workaround/flow and failure modes from Q3 conversation}

## Approach
{Selected strategy from 5f conversation — how existing strengths are leveraged}

## Architecture Decisions
| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| {decision} | {why} | {what else was considered} |

## Dependencies & Risks
- {external dependency or integration risk}
- {performance or scaling concern}

## Open Questions
- {Anything technically unresolved from the conversation}
```

### design-brief.md — Owner: Design

```markdown
# Design Brief: {feature}

_Generated by `/officeHours` on {ISO date}_
_Owner: Design_

## Experience Goals
{What the ideal interaction feels like from Q4 — the emotional qualities to achieve (fast, confident, effortless, informed, etc.)}

## Key Interactions to Design
{The moments identified in Q4 that will make or break the experience — ranked by importance}

1. **{Interaction name}** — {why it matters}
2. **{Interaction name}** — {why it matters}
...

## UX Requirements
{Requirements from product.md that have a direct UX surface — extracted and rephrased as design constraints}

- The interface shall...
- When [event], the UI shall...

## Constraints & Guardrails
- {Technical constraints from engineering.md that affect the design}
- {Scope constraints from MVP — what is explicitly out of scope for this design}

## Design Language Reference
{If design-tokens.json / .impeccable.md exist, note their path here and call out any tokens directly relevant to this feature}
```

### TASKS.md — Owner: Engineering (cross-team visibility)

```markdown
# Tasks: {feature}

_Generated by `/officeHours` on {ISO date}_
_Owner: Engineering — visible to all teams_

---
id: TASK-1
domain: engineering
depends: []
complexity: small
reqs: [REQ-U1]
---
## TASK-1: {title}

{Detailed description of what to do, inputs, expected outputs}

---
id: TASK-2
domain: engineering
depends: [TASK-1]
complexity: medium
reqs: [REQ-U2, REQ-E1]
---
## TASK-2: {title}

{Description}

---
id: TASK-3
domain: design
depends: []
complexity: medium
reqs: [REQ-U1]
---
## TASK-3: {title}

{Description — design tasks reference design-brief.md}
```

Task guidelines:
- Order tasks by dependency graph (topological sort)
- Complexity values: `small` (< 1 hour), `medium` (1-4 hours), `large` (4+ hours)
- The `domain` field is `engineering`, `design`, or `product`
- The `reqs` field traces each task back to one or more requirements
- Each task should be atomic — one logical unit of work

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

  product.md       → Product     — {N} requirements, {N} acceptance criteria, {N} success metrics
  engineering.md   → Engineering — approach selected, {N} architecture decisions, {N} open questions
  design-brief.md  → Design      — {N} key interactions, UX requirements, design language reference
  TASKS.md         → Engineering — {N} tasks ({e.g. "4 engineering, 2 design, 1 product"} | {e.g. "2 small, 3 medium, 1 large"})

Summary:
  Problem: {one-line problem statement}
  User: {persona}
  MVP: {one-line scope summary}
  Key metric: {primary success metric}

Suggested next steps:
  /productReview — Get founder-lens feedback on the product plan
  /archReview    — Review the engineering design
  /design-language + /design-mockup — Start the design sprint from design-brief.md
```

### Sub-skill Dispatch

Present naturally at the end of the session:
> "Plan is ready. Would you like a review? I can run an architectural review, a product review, or both."

Based on response:
- Architectural concerns → Skill tool: `archReview`
- Product/founder lens → Skill tool: `productReview`
- Both → invoke in sequence: `archReview` then `productReview`
- Neither → done
