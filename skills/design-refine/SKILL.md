---
name: design-refine
description: Dispatch Impeccable refinement commands (colorize, animate, polish, typeset, arrange, etc.) with design language context pre-loaded. Suggests which refinements would help most if no command specified.
argument-hint: "[impeccable-command]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Skill, Glob, AskUserQuestion
---

<!-- === PREAMBLE START === -->

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
```

<!-- === PREAMBLE END === -->

## Design Context — Load Design Language

Before proceeding, load existing design context:

1. Read `.impeccable.md` if it exists (brand personality, aesthetic direction)
2. Read `design-tokens.json` if it exists (W3C DTCG tokens: colors, typography, spacing)
3. Read `planning/DESIGN_SYSTEM.md` if it exists (design principles, component catalog)

If none of these files exist and this skill requires design context to function, advise:
> "No design language found. Run `/design-analyze <url>` to extract tokens from a reference site, then `/design-language` to define brand personality."

---

# Design Refine — Dispatch Impeccable Refinement Commands

Pre-loads the design language context and dispatches Impeccable refinement commands. If no command specified, analyzes the current implementation and suggests which refinements would be most impactful.

## Step 1: Analyze Current State

If no Impeccable command was specified as argument:

1. Read the current implementation files (detect via Glob: `*.tsx`, `*.jsx`, `*.html`, `*.css`, `*.swift`)
2. Analyze against the design language in `.impeccable.md`
3. Suggest the most impactful refinements:

```
Design Refinement Analysis
==========================

Current implementation could benefit from:

1. /design-refine colorize — Color usage doesn't match token palette; 3 hardcoded colors found
2. /design-refine typeset — Heading hierarchy inconsistent with design-tokens.json scale
3. /design-refine polish — Missing hover states, focus rings, and micro-interactions
4. /design-refine arrange — Layout spacing doesn't follow the spacing scale

Run any of these commands to apply the refinement.
```

If a command was specified, skip to Step 2.

## Step 2: Pre-load Design Context

Before dispatching, ensure the design context is available for the Impeccable command:

1. Confirm `.impeccable.md` exists (required — Impeccable uses this for brand context)
2. Confirm `design-tokens.json` exists (needed for exact token values)
3. If either is missing, warn and offer to create via `/design-language` or `/design-analyze`

## Step 3: Dispatch Impeccable Command

Invoke the specified Impeccable command via the Skill tool:

```
Skill(<command>)
```

Available Impeccable commands include:
- `colorize` — Apply or fix color usage
- `animate` — Add meaningful animations
- `polish` — Visual polish pass (shadows, borders, transitions)
- `typeset` — Typography refinement
- `arrange` — Layout and spacing refinement
- `accessibilize` — Accessibility improvements
- `responsivize` — Responsive design improvements
- `iconify` — Icon usage and consistency
- `darkmode` — Dark mode implementation
- And others from the Impeccable skill set

The design context from `.impeccable.md` and `design-tokens.json` will be available to the dispatched command.

## Step 4: Post-Refinement Token Check

After the Impeccable command completes, check if the refinement introduced any values not in `design-tokens.json`:

1. Scan modified files for color values, font sizes, spacing values
2. Compare against token values in `design-tokens.json`
3. If new values were introduced:
   - Ask if they should be added to `design-tokens.json`
   - If yes, update the tokens file

## Step 5: Report

```
Refinement Applied
==================

Command:    <impeccable-command>
Files:      <list of modified files>
Token sync: <in sync / N new values added to design-tokens.json>

Next steps:
  • Run /design-verify to check implementation against mockup
  • Run /design-refine [another-command] for additional refinements
  • Run /design-refine (no args) for a new analysis
  • If `design-tokens.json` was updated, run `/design-implement` to regenerate platform token files
```

## Rules

- Always dispatch via `Skill` tool — never re-implement Impeccable commands inline
- Design context must be loaded before dispatch — Impeccable commands need `.impeccable.md`
- If `design-tokens.json` is updated, note that `/design-implement` should be re-run to regenerate platform token files
- Do not modify `.impeccable.md` during refinement — only `design-tokens.json` may be updated
