---
name: design-language
description: Interactive session defining brand personality, aesthetic direction, and design principles. Reads existing tokens and DESIGN_SYSTEM.md for context, asks strategic questions, and writes .impeccable.md.
argument-hint:
disable-model-invocation: true
allowed-tools: Read, Write, AskUserQuestion
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

# Design Language — Define Brand Personality

Interactive session that defines the brand personality, aesthetic direction, and design principles for AI consumption. Produces `.impeccable.md` which is referenced by all design skills and Impeccable commands.

## Step 1: Gather Existing Context

Read these files if they exist:
- `planning/DESIGN_SYSTEM.md` — upstream design decisions and principles
- `design-tokens.json` — extracted token values from reference sites

Note what's already defined vs. what needs to be decided.

## Step 2: Ask Strategic Questions

Ask the user these questions interactively (via AskUserQuestion). Group related questions — don't ask all at once:

**Group 1: Users & Purpose**
- Who are your primary users?
- What is the core purpose of this product?
- What emotional response should the design evoke?

**Group 2: Brand Personality**
- Describe your brand in 3 words (e.g., "precise, warm, confident")
- Name 1-3 reference products/sites whose aesthetic you admire
- Name 1-3 anti-references — aesthetics you want to avoid and why

**Group 3: Aesthetic Direction**
- Style direction: minimal, expressive, editorial, brutalist, organic, other?
- Light mode, dark mode, or both?
- Color constraints: existing brand colors to preserve? Accessibility requirements?

**Group 4: Technical Context**
- Target platforms: web only, iOS only, or both?
- WCAG compliance level: A, AA, or AAA?
- Any specific framework constraints (Tailwind, SwiftUI, etc.)?

Skip questions that are already answered by `DESIGN_SYSTEM.md` or `design-tokens.json`.

## Step 3: Write .impeccable.md

Write `.impeccable.md` at the project root. Format:

```markdown
# Design Language

> This file defines brand personality and aesthetic direction for AI-assisted design.
> It is consumed by Impeccable commands and the `/design-*` skill pipeline.
> See `planning/DESIGN_SYSTEM.md` for strategic design decisions and component catalog.
> See `design-tokens.json` for machine-readable token values.

## Brand Personality

**Three words:** [word1], [word2], [word3]

**Voice:** [description of the brand's visual voice]

## Aesthetic Direction

**Style:** [minimal/expressive/editorial/etc.]

**References:**
- [reference 1] — [what to take from it]
- [reference 2] — [what to take from it]

**Anti-references:**
- [anti-ref 1] — [what to avoid and why]

## Color

[Color philosophy and constraints — references design-tokens.json for exact values]

## Typography

[Typography approach — scale, hierarchy, font personality]

## Spacing & Layout

[Spacing philosophy — dense vs. generous, grid approach]

## Motion

[Animation philosophy — purpose, duration, easing preferences]

## Accessibility

**WCAG level:** [A/AA/AAA]
[Any additional accessibility commitments]

## Platform Notes

[Web-specific, iOS-specific, or cross-platform considerations]
```

## Step 4: Confirm

Present the written `.impeccable.md` content and ask:
> "Does this capture your design language? I can adjust any section."

## Rules

- Preserve all existing content from `DESIGN_SYSTEM.md` — `.impeccable.md` complements, not replaces
- Be specific in descriptions — "clean and minimal" is too vague; "generous whitespace, muted colors, SF Pro typography with tight leading" is useful
- If `design-tokens.json` exists, reference specific token values rather than re-describing them
- Do not overwrite existing `.impeccable.md` without asking
