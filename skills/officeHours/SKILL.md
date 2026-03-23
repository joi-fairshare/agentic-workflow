---
name: officeHours
description: "Spec-driven brainstorming session with EARS-format requirements. Outputs requirements.md + design.md + TASKS.md to plans/ directory."
argument-hint: "[feature-or-problem-description]"
disable-model-invocation: true
allowed-tools: Bash(git *), Agent, Read, Write, Glob, Grep
---

# Office Hours — Spec-Driven Brainstorming

Runs a structured brainstorming session that produces EARS-format requirements, a technical design doc, and an atomic task breakdown.

<!-- === PREAMBLE START === -->

> **Agentic Workflow** — 22 skills available. Run any as `/<name>`.
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
> | `/design-analyze` | Extract design tokens from reference sites |
> | `/design-language` | Define brand personality and aesthetic direction |
> | `/design-evolve` | Merge new reference into design language |
> | `/design-mockup` | Generate HTML mockup from design language |
> | `/design-implement` | Generate production code from mockup |
> | `/design-refine` | Dispatch Impeccable refinement commands |
> | `/design-verify` | Screenshot diff implementation vs mockup |
> | `/verify-app` | Playwright browser verification of running app |
>
> **Output directory:** `~/.agentic-workflow/<repo-slug>/`

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
for s in review postReview addressReview enhancePrompt bootstrap rootCause bugHunt bugReport shipRelease syncDocs weeklyRetro officeHours productReview archReview design-analyze design-language design-evolve design-mockup design-implement design-refine design-verify verify-app; do
  [ -d "$HOME/.claude/skills/$s" ] || SKILLS_OK=false
done

BRIDGE_OK=false
[ -f "$(dirname "$(readlink -f "$HOME/.claude/skills/review/SKILL.md" 2>/dev/null || echo /dev/null)")/../mcp-bridge/dist/mcp.js" ] 2>/dev/null && BRIDGE_OK=true

RULES_OK=false
[ -d ".claude/rules" ] && [ -n "$(ls -A .claude/rules/ 2>/dev/null)" ] && RULES_OK=true

echo "skills-symlinked: $SKILLS_OK"
echo "bridge-built: $BRIDGE_OK"
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
mkdir -p "$HOME/.agentic-workflow/$REPO_SLUG/plans"
```

---

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

## Step 6: Generate Three Output Files

Synthesize the entire conversation into three structured files:

### requirements.md

```markdown
# Requirements: {feature}

_Generated by `/officeHours` on {ISO date}_

## Problem Statement
{Refined problem statement from Q1 conversation}

## Target User
{User persona, triggers, and conditions from Q2 conversation}

## Requirements

### Ubiquitous
- REQ-U1: The [system] shall [action]
- REQ-U2: The [system] shall [action]
- ...

### Event-driven
- REQ-E1: When [event], the [system] shall [action]
- REQ-E2: When [event], the [system] shall [action]
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

## Acceptance Criteria
- AC-1: {derived from requirements, measurable}
- AC-2: ...

## Traceability
| Requirement | Acceptance Criteria |
|------------|-------------------|
| REQ-U1 | AC-1 |
| REQ-E1 | AC-2 |
| ... | ... |
```

**Sections for unselected EARS types are omitted entirely** (not shown as empty).

The **Traceability table** links each requirement to at least one acceptance criterion.

### design.md

```markdown
# Design: {feature}

_Generated by `/officeHours` on {ISO date}_

## Current State
{Current workaround/flow from Q3 conversation}

## Approach
{Selected strategy from 5f conversation -- how existing strengths are leveraged}

## Architecture Decisions
| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| {decision} | {why} | {what else was considered} |

## MVP Scope

### In Scope
- {feature 1}
- {feature 2}

### Out of Scope
- {deferred item 1}
- {deferred item 2}

## Success Criteria
| Metric | Target | Timeframe |
|--------|--------|-----------|
| {metric} | {target} | {when} |

## Open Questions
- {Anything unresolved from the conversation}
```

### TASKS.md

```markdown
# Tasks: {feature}

_Generated by `/officeHours` on {ISO date}_

---
id: TASK-1
depends: []
complexity: small
reqs: [REQ-U1]
---
## TASK-1: {title}

{Detailed description of what to do, inputs, expected outputs}

---
id: TASK-2
depends: [TASK-1]
complexity: medium
reqs: [REQ-U2, REQ-E1]
---
## TASK-2: {title}

{Description}
```

Task guidelines:
- Order tasks by dependency graph (topological sort)
- Complexity values: `small` (< 1 hour), `medium` (1-4 hours), `large` (4+ hours)
- The `reqs` field traces each task back to one or more requirements
- Each task should be atomic -- one logical unit of work

## Step 7: Write the Output Directory

Generate a URL-safe slug from the title (lowercase, hyphens, no special chars). Create the output directory and write all three files:

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$HOME/.agentic-workflow/$REPO_SLUG/plans/${TIMESTAMP}-{slug}"
```

Write the three files to:
- `$HOME/.agentic-workflow/$REPO_SLUG/plans/{timestamp}-{slug}/requirements.md`
- `$HOME/.agentic-workflow/$REPO_SLUG/plans/{timestamp}-{slug}/design.md`
- `$HOME/.agentic-workflow/$REPO_SLUG/plans/{timestamp}-{slug}/TASKS.md`

## Step 8: Report

Show a summary to the user:

```
Office Hours complete!

Plan written to: ~/.agentic-workflow/{repo-slug}/plans/{timestamp}-{slug}/
  requirements.md — {N} requirements ({breakdown by EARS type, e.g. "3 ubiquitous, 2 event-driven, 2 unwanted"})
  design.md       — approach, architecture decisions, MVP scope
  TASKS.md        — {N} tasks ({breakdown by complexity, e.g. "2 small, 3 medium, 1 large"})

Summary:
  Problem: {one-line problem statement}
  User: {persona}
  MVP: {one-line scope summary}
  Key metric: {primary success metric}

Suggested next steps:
  /productReview — Get founder-lens feedback on this plan
  /archReview — Review the engineering architecture
```
