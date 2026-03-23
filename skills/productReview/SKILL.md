---
name: productReview
description: "Founder/product lens review of plans with 4 scope modes -- mvp, growth, scale, pivot. Challenges assumptions and tightens scope."
argument-hint: "[--mode mvp|growth|scale|pivot] [plan-file-or-description]"
disable-model-invocation: true
allowed-tools: Bash(git *), Agent, Read, Write, Glob, Grep
---

# Product Review — Founder Lens

Reviews plans through a product/founder lens with four distinct modes. Challenges assumptions, tightens scope, and delivers a verdict.

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

## Step 1: Parse Arguments and Resolve Plan

**Parse the mode flag:**
- Look for `--mode` followed by one of: `mvp`, `growth`, `scale`, `pivot`
- Default to `mvp` if no mode is specified

**Resolve the plan to review:**
1. If a file path or directory path is given as argument, use it directly
2. If a text description is given, use it directly as the plan content
3. If neither is provided, auto-discover the most recent plan in `$HOME/.agentic-workflow/$REPO_SLUG/plans/`. Plans may be either a directory (new SDD format with `requirements.md`, `design.md`, `TASKS.md`) or a single `.md` file (legacy format). Check both and prefer whichever is newest:

```bash
# Find newest plan directory (SDD format) and newest plan file (legacy format)
NEWEST_DIR=$(ls -dt "$HOME/.agentic-workflow/$REPO_SLUG/plans/"*/ 2>/dev/null | head -1)
NEWEST_FILE=$(ls -t "$HOME/.agentic-workflow/$REPO_SLUG/plans/"*.md 2>/dev/null | head -1)

# Compare timestamps -- prefer whichever is more recent
if [ -n "$NEWEST_DIR" ] && [ -n "$NEWEST_FILE" ]; then
  if [ "$NEWEST_DIR" -nt "$NEWEST_FILE" ]; then
    PLAN_TARGET="$NEWEST_DIR"
  else
    PLAN_TARGET="$NEWEST_FILE"
  fi
elif [ -n "$NEWEST_DIR" ]; then
  PLAN_TARGET="$NEWEST_DIR"
elif [ -n "$NEWEST_FILE" ]; then
  PLAN_TARGET="$NEWEST_FILE"
fi
```

**If `PLAN_TARGET` is a directory** (SDD format), read all three files inside it (`requirements.md`, `design.md`, `TASKS.md`) and review them holistically. The review framework maps naturally:
- **Scope check** -- `requirements.md` (EARS requirements) + `TASKS.md` (task list)
- **Persona clarity** -- `requirements.md` (Target User section)
- **Timeline reality** -- `TASKS.md` (complexity estimates)
- **Riskiest assumption** -- `design.md` (Architecture Decisions + Open Questions)

**If `PLAN_TARGET` is a single file** (legacy format), read and review it as before.

If no plan is found at all, tell the user:
> "No plan found. Provide a file path, a description, or run `/officeHours` first to generate a design doc."

## Step 2: Read Context

Read project context to inform the review:

- Read `CLAUDE.md` if it exists
- Read `README.md` if it exists
- Use Glob to find relevant planning docs and skim them

## Step 3: Review Through the Mode Lens

Apply the selected mode's review framework to the plan:

### MVP Mode (default)

Focus on shipping speed and scope discipline:

- **Scope check** — Is this truly minimal? List every feature and challenge whether each one is essential for v1. Identify at least one thing that can be cut.
- **Persona clarity** — Is there a single, clear user persona? If the plan serves multiple personas, flag it.
- **Timeline reality** — Can this ship in under 2 weeks of focused effort? If not, what needs to shrink?
- **Riskiest assumption** — Identify the single biggest assumption. Propose a way to test it before building.
- **Build vs. skip** — For each component, ask: can we use an existing tool, hardcode it, or skip it entirely for v1?

### Growth Mode

Focus on user acquisition and retention:

- **Growth levers** — What are the 2-3 primary growth mechanisms? Are they built into the product or bolted on?
- **Activation funnel** — Map the steps from "user discovers this" to "user gets value". Where is the biggest drop-off risk?
- **10x usage** — What would 10x the current usage look like? Does the current design support or block it?
- **Retention hooks** — What brings users back? Is there a natural cadence (daily, weekly, per-PR)?
- **Viral coefficient** — Does usage by one person naturally expose others to the product?

### Scale Mode

Focus on operational sustainability:

- **100x load** — What breaks at 100x current usage? Identify the first bottleneck.
- **Unit economics** — What is the cost per user/operation? Does it improve or degrade with scale?
- **Automation gaps** — What currently requires manual intervention? What is the path to automating it?
- **Operational bottlenecks** — Where will the team spend most of their time at scale? Is that the right place?
- **Data gravity** — Where does data accumulate? Does it become an asset or a liability?

### Pivot Mode

Focus on strategic direction:

- **What's working** — Identify the strongest signal from current usage/design. What should be doubled down on?
- **What should die** — Identify features or directions that are not earning their complexity. Recommend killing them.
- **Adjacent opportunity** — Based on the current position, what nearby problem could be solved with minimal additional effort?
- **Fresh start test** — If starting from scratch today with current knowledge, what would be built differently?
- **Core value extraction** — What is the one irreducible thing this product does that matters?

## Step 4: Generate Review

Produce a structured review document:

```markdown
# Product Review: {plan title}

_Reviewed by `/productReview` on {ISO date} | Mode: {mode}_

## Verdict: {SHIP | ITERATE | RETHINK}

{One paragraph justification for the verdict}

## Strengths
1. {What's strong about this plan}
2. {Another strength}
3. {Another strength}

## Concerns

| # | Severity | Concern | Recommendation |
|---|----------|---------|----------------|
| 1 | {high/medium/low} | {concern} | {what to do} |
| 2 | {high/medium/low} | {concern} | {what to do} |
| ... | ... | ... | ... |

## Scope Suggestions

### Cut
- {feature/element to remove and why}

### Keep
- {feature/element that's essential and why}

### Add
- {missing element that would strengthen the plan}

## Key Questions for the Team
1. {Question that needs answering before proceeding}
2. {Another question}
3. {Another question}

## Recommended Next Action
{Single concrete next step -- be specific}
```

## Step 5: Write the Review

Generate a URL-safe slug from the plan title (lowercase, hyphens, no special chars). Write the file:

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
```

Write to: `$HOME/.agentic-workflow/$REPO_SLUG/plans/{timestamp}-product-review-{slug}.md`

## Step 6: Report

Show a summary to the user:

```
Product Review complete! ({mode} mode)

Verdict: {SHIP | ITERATE | RETHINK}

Review written to: ~/.agentic-workflow/{repo-slug}/plans/{timestamp}-product-review-{slug}.md

Top concerns:
  1. [{severity}] {concern summary}
  2. [{severity}] {concern summary}
  3. [{severity}] {concern summary}

Recommended next action: {one-line action}

Suggested next steps:
  /archReview — Review the engineering architecture
  /officeHours — Brainstorm refinements to address concerns
```
