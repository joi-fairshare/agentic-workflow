---
name: design-mockup
description: Generate an HTML mockup informed by the design language, serve it via the visual companion, iterate with feedback until approved, then screenshot the final version as a baseline for /design-verify.
argument-hint: <screen-name>
disable-model-invocation: true
allowed-tools: Bash(*/start-server.sh *), Bash(mkdir *), Write, Read, Agent, AskUserQuestion
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

# Design Mockup — Generate HTML Mockup from Design Language

Generate an HTML mockup using the visual companion, informed by the design language. Iterate with user feedback until approved, then capture a baseline screenshot for verification.

## Step 1: Validate Arguments

The user must provide a screen name (e.g., "dashboard", "login", "settings", "onboarding").

If no screen name provided:
> "Usage: `/design-mockup <screen-name>`
> Example: `/design-mockup dashboard`"

## Step 2: Load Design Context

Read `.impeccable.md` and `design-tokens.json` to understand:
- Color palette and semantic color usage
- Typography scale and font choices
- Spacing system and layout approach
- Brand personality and aesthetic direction

These values must drive every visual decision in the mockup.

## Step 3: Generate HTML Mockup

Create an HTML file as a content fragment for the visual companion. The mockup should:

1. **Be a single HTML file** with inline CSS (no external dependencies except CDN fonts)
2. **Use exact token values** from `design-tokens.json` — colors, font sizes, spacing, radii
3. **Reflect the brand personality** from `.impeccable.md` — not generic Bootstrap/Tailwind defaults
4. **Be responsive** — include viewport meta tag and basic responsive breakpoints
5. **Include realistic content** — use plausible text and data, not "Lorem ipsum"

Save to the visual companion's session directory:
```
.superpowers/brainstorm/<session-id>/<screen-name>.html
```

## Step 4: Present in Browser

Start the visual companion server:
```bash
*/start-server.sh *
```

The mockup will be visible in the browser for the user to review.

## Step 5: Iterate

Use `AskUserQuestion` to gather feedback from the user. Common adjustments:
- Layout changes (reorder sections, change grid)
- Color refinements (too much contrast, wrong emphasis)
- Typography tweaks (heading sizes, body line-height)
- Content density (too sparse, too crowded)
- Missing elements (navigation, footer, status indicators)

Apply changes to the HTML file and continue asking via `AskUserQuestion` until the user approves.

## Step 6: Capture Baseline

Once approved, save the baseline screenshot for `/design-verify`:

```bash
mkdir -p "$HOME/.agentic-workflow/$REPO_SLUG/design"
```

Use an `Agent` subagent with Playwright MCP tools to capture the screenshot. The subagent should:
1. Navigate to the mockup URL served by the visual companion
2. Take a full-page screenshot
3. Save it to the baseline path

Baseline path:
```
~/.agentic-workflow/<repo-slug>/design/mockup-<screen-name>.png
```

## Step 7: Report

```
Mockup Approved
===============

Screen:    <screen-name>
File:      .superpowers/brainstorm/<session-id>/<screen-name>.html
Baseline:  ~/.agentic-workflow/<repo-slug>/design/mockup-<screen-name>.png

Next steps:
  • Run /design-implement web|swiftui to generate production code
  • Run /design-mockup <another-screen> to mockup additional screens
  • Run /design-refine to apply Impeccable refinements
```

## Rules

- Every color, font size, and spacing value must come from `design-tokens.json` — no hardcoded values
- The mockup is a design artifact, not production code — optimize for visual fidelity, not code quality
- Include hover states and interactive affordances in the HTML/CSS
- If `.impeccable.md` doesn't exist, warn but still allow creation with manual style guidance
- Save only ONE baseline per screen name — re-running overwrites the previous baseline after confirmation
