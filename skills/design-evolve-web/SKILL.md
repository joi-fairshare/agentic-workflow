---
name: design-evolve-web
description: Analyze a new reference URL mid-project and selectively merge design tokens into the existing design language. Diffs new tokens against current, asks what to adopt/adapt/ignore, updates design-tokens.json and .impeccable.md.
argument-hint: <url>
disable-model-invocation: true
allowed-tools: Bash(npx dembrandt *), Bash(git *), Read, Write, Edit, AskUserQuestion
---

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

<!-- === PREAMBLE END === -->

<!-- === DESIGN PREAMBLE START === -->

## Design Context — Load Design Language

Before proceeding, load existing design context:

1. Read `.impeccable.md` if it exists (brand personality, aesthetic direction)
2. Read `design-tokens.json` if it exists (W3C DTCG tokens: colors, typography, spacing)
3. Read `planning/DESIGN_SYSTEM.md` if it exists (design principles, component catalog)

If none of these files exist and this skill requires design context to function, advise:
> "No design language found. Run `/design-analyze` (detects web vs iOS automatically) to extract tokens, then `/design-language` to define brand personality."

<!-- === DESIGN PREAMBLE END === -->

---

# Design Evolve — Merge New Reference into Design Language

Analyze a new reference site mid-project and selectively merge its design elements into the existing design language. Shows a diff of what would change, lets the user choose what to adopt.

## Step 1: Validate Prerequisites

Both `.impeccable.md` and `design-tokens.json` must exist. If either is missing:
> "No existing design language found. Run `/design-analyze` and `/design-language` first to establish a baseline before evolving."

## Step 2: Validate URL

Validate that the `<url>` argument starts with `http://` or `https://` and contains only URL-safe characters: letters, digits, `:`, `/`, `.`, `-`, `_`, `~`, `?`, `=`, `%`, `+`, `@`, `,`.

Reject any URL containing characters outside this allowlist.

If validation fails:
> "Invalid URL: `<url>`. URLs must start with `http://` or `https://` and may only contain URL-safe characters (`a-zA-Z0-9` and `:/.\\-_~?=%+@,`). Offending characters: `<list of disallowed characters found>`."

## Step 3: Run Dembrandt on New URL

```bash
npx dembrandt <url> --dtcg --save-output
```

Read the Dembrandt output.

## Step 4: Present Diff

Compare new tokens against existing `design-tokens.json`:

```
Design Evolution Diff
=====================

Source: <url>

NEW tokens (not in current language):
  color.accent-blue: #3B82F6
  spacing.2xl: 3rem
  typography.mono: "JetBrains Mono"

DIFFERENT values (exist but differ):
  color.primary: current=#1A1A2E → new=#0F172A
  spacing.lg: current=2rem → new=1.5rem

UNCHANGED (same in both):
  color.background: #FFFFFF
  typography.body.fontSize: 1rem
```

## Step 5: Ask What to Adopt

For each category (new tokens, different values), ask via AskUserQuestion:
> "Which elements would you like to adopt from <url>?
> - **Adopt**: take the new value as-is
> - **Adapt**: use the new value as inspiration but modify
> - **Ignore**: keep current value unchanged"

## Step 6: Update Design Files

Apply the user's choices:
1. Update `design-tokens.json` with adopted/adapted tokens
2. Update `.impeccable.md` if the new reference changes aesthetic direction:
   - Add to references list if adopted
   - Note any style shifts in relevant sections

## Step 7: Report

```
Design Language Updated
=======================

Adopted:  N tokens from <url>
Adapted:  N tokens (modified from <url>)
Ignored:  N tokens (kept current values)

Updated files:
  design-tokens.json (N changes)
  .impeccable.md (references updated)

Next steps:
  • Run /design-implement web|swiftui to regenerate platform-specific token files
  • Run /design-verify to check implementation against updated tokens
```

## Rules

- Never overwrite existing tokens without user confirmation
- Show exact before/after values for all changes
- Preserve token structure — only update values, don't reorganize
- Clean up Dembrandt output files after processing
