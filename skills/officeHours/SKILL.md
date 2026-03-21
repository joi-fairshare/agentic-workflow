---
name: officeHours
description: YC-style brainstorming session with 6 forcing questions. Outputs a structured design doc to plans/ directory.
argument-hint: "[feature-or-problem-description]"
disable-model-invocation: true
allowed-tools: Bash(git *), Agent, Read, Write, Glob, Grep
---

# Office Hours — YC-Style Brainstorming

Runs a structured brainstorming session through 6 forcing questions, then synthesizes the conversation into a design doc.

> **Agentic Workflow** — 21 skills available. Run any as `/<name>`.
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
> | `/officeHours` | YC-style brainstorming → design doc |
> | `/productReview` | Founder/product lens plan review |
> | `/archReview` | Engineering architecture plan review |
> | `/design-analyze` | Extract design tokens from reference sites |
> | `/design-language` | Define brand personality and aesthetic direction |
> | `/design-evolve` | Merge new reference into design language |
> | `/design-mockup` | Generate HTML mockup from design language |
> | `/design-implement` | Generate production code from mockup |
> | `/design-refine` | Dispatch Impeccable refinement commands |
> | `/design-verify` | Screenshot diff implementation vs mockup |
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
for s in review postReview addressReview enhancePrompt bootstrap rootCause bugHunt bugReport shipRelease syncDocs weeklyRetro officeHours productReview archReview design-analyze design-language design-evolve design-mockup design-implement design-refine design-verify; do
  [ -d "$HOME/.claude/skills/$s" ] || SKILLS_OK=false
done

BRIDGE_OK=false
[ -f "$(dirname "$(readlink -f "$HOME/.claude/skills/review/SKILL.md" 2>/dev/null || echo /dev/null)")/../mcp-bridge/dist/mcp.js" ] 2>/dev/null && BRIDGE_OK=true

echo "skills-symlinked: $SKILLS_OK"
echo "bridge-built: $BRIDGE_OK"
```

If either check fails, ask the user via AskUserQuestion:
> "Agentic Workflow is not fully set up. Run setup.sh now? (yes/no)"

If **yes**: run `bash <path-to-agentic-workflow>/setup.sh` (resolve path from the review skill symlink target).
If **no**: warn that some features may not work, then continue.

Create the output directory for this repo:
```bash
mkdir -p "$HOME/.agentic-workflow/$REPO_SLUG"
mkdir -p "$HOME/.agentic-workflow/$REPO_SLUG/plans"
```

---

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

## Step 3: Six Forcing Questions

Work through each question sequentially. For each one, present your analysis based on the project context, then pause and wait for the user's response before moving on. This is a conversation -- do not use AskUserQuestion, just present each question naturally and wait.

### Q1: What problem are you solving?

Restate the problem in your own words based on what the user described and what you learned from the codebase. Be specific.

Then ask: **"Is this right, or is there a deeper issue?"**

Wait for the user's response.

### Q2: Who has this problem?

Based on the project and the problem, identify the specific user persona who experiences this. Consider: developer vs. end-user, team size, expertise level.

Then ask: **"Who specifically experiences this? Is it the right persona to design for?"**

Wait for the user's response.

### Q3: How do they solve it today?

Map the current workaround or status quo. Look at existing code, docs, or patterns that relate to this problem. Describe the current flow.

Then ask: **"What's the current flow? What's the most painful part?"**

Wait for the user's response.

### Q4: What's your unfair advantage?

Given the codebase, tech stack, existing infrastructure, and team context -- what can this project build that others can't? Present 2-3 concrete options that leverage existing strengths.

Then ask: **"Which of these resonates? Is there something I'm missing about your position?"**

Wait for the user's response.

### Q5: What's the smallest version?

Propose an MVP scope -- the absolute minimum that delivers value. List what's in and what's explicitly out. Be aggressive about cutting scope.

Then ask: **"Can we cut anything else? What's the one thing this must do on day one?"**

Wait for the user's response.

### Q6: How will you know it works?

Define 2-3 concrete, measurable success criteria. Distinguish between leading indicators (can measure in days) and lagging indicators (takes weeks).

Then ask: **"What would you measure? When would you check?"**

Wait for the user's response.

## Step 4: Generate Design Doc

Synthesize the entire conversation into a structured design doc:

```markdown
# Design Doc: {title}

_Generated by `/officeHours` on {ISO date}_

## Problem Statement
{Refined problem statement from Q1 conversation}

## Target User
{User persona from Q2 conversation}

## Current State
{Current workaround/flow from Q3 conversation}

## Approach
{Selected strategy from Q4 conversation -- how existing strengths are leveraged}

## MVP Scope

### In Scope
- {feature 1}
- {feature 2}
- ...

### Out of Scope
- {deferred item 1}
- {deferred item 2}
- ...

## Success Criteria
| Metric | Target | Timeframe |
|--------|--------|-----------|
| {metric 1} | {target} | {when to check} |
| {metric 2} | {target} | {when to check} |

## Open Questions
- {Anything unresolved from the conversation}

## Next Steps
- [ ] Run `/productReview` to get founder-lens feedback on this plan
- [ ] Run `/archReview` for engineering architecture review
- [ ] {Any other next steps identified during conversation}
```

## Step 5: Write the Design Doc

Generate a URL-safe slug from the title (lowercase, hyphens, no special chars). Write the file:

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
```

Write to: `$HOME/.agentic-workflow/$REPO_SLUG/plans/{timestamp}-{slug}.md`

## Step 6: Report

Show a summary to the user:

```
Office Hours complete!

Design doc written to: ~/.agentic-workflow/{repo-slug}/plans/{timestamp}-{slug}.md

Summary:
  Problem: {one-line problem statement}
  User: {persona}
  MVP: {one-line scope summary}
  Key metric: {primary success metric}

Suggested next steps:
  /productReview — Get founder-lens feedback on this plan
  /archReview — Review the engineering architecture
```
