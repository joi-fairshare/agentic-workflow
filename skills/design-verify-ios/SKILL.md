---
name: design-verify-ios
description: Boot simulator if needed, capture screenshot via XcodeBuildMCP, diff against mockup baseline using design-comparison MCP. Reports discrepancies with fix suggestions.
argument-hint: [screen-name]
disable-model-invocation: true
allowed-tools: Bash(source ~/.claude/skills/*), Read, Write, Glob, AskUserQuestion
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

# Design Verify iOS — Simulator Screenshot Diff vs Mockup

Captures a simulator screenshot and compares it against the approved mockup baseline using the design-comparison MCP.

## Step 1: Load Baselines

Find mockup baselines in the design output directory:
```bash
ls ~/.agentic-workflow/$REPO_SLUG/design/mockup-ios*.png 2>/dev/null
```

**Filtering by screen-name:** If a `[screen-name]` argument was provided, filter to `mockup-ios-<screen-name>.png`. If no argument, verify all iOS baselines found.

If no baselines match:
> "No iOS mockup baselines found. Run `/design-mockup-ios` first to create a baseline."

## Step 2: Acquire Simulator Lock

Acquire the simulator lock to prevent concurrent sessions from corrupting screenshots:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-verify-ios/SKILL.md")")/../_shared"
LOCK_NAME=ios-sim
source "$SHARED_DIR/skill-lock.sh"
acquire_lock || { echo "Could not acquire simulator lock — another skill may be using the simulator"; exit 1; }
```

If any step after lock acquisition fails, call `release_lock` before stopping. Never exit this skill with the simulator lock held.

## Step 3: Ensure Simulator Is Running

```
xcodebuildmcp: list_sims
```

If no simulator is booted, launch the app:
```
xcodebuildmcp: launch_app_sim
```

If the app bundle ID can't be determined, ask via AskUserQuestion.

## Step 4: Navigate to Screen (if needed)

If a `[screen-name]` argument was provided that implies navigation (e.g., "settings", "profile"):
- Use `xcodebuildmcp: tap` to navigate to the target screen
- Wait briefly for the view to appear (use `xcodebuildmcp: snapshot_ui` to confirm)

## Step 5: Capture Implementation Screenshot

```
xcodebuildmcp: screenshot
```

Save to:
```
~/.agentic-workflow/<repo-slug>/design/impl-<screen>-ios.png
```

## Step 6: Diff Against Baseline

Call the design-comparison MCP tool `compare_design`:

- **reference:** `~/.agentic-workflow/<repo-slug>/design/mockup-ios<-screen>.png`
- **implementation:** `~/.agentic-workflow/<repo-slug>/design/impl-<screen>-ios.png`

Save diff image:
```
~/.agentic-workflow/<repo-slug>/design/diff-<screen>-ios.png
```

## Step 7: Report Results

### Pass (< 2% diff):
```
[PASS] iOS Verification Passed
================================

Screen:   <screen-name>
Diff:     <N>% (threshold: 2%)

Implementation matches the approved iOS mockup.
```

### Minor Discrepancies (2–10%):
```
[WARN] Minor iOS Discrepancies Found
=====================================

Screen:   <screen-name>
Diff:     <N>%

Discrepancies:
  1. Header height differs from mockup
  2. Button corner radius uses 4pt instead of Theme.Radius.md
  3. Body text color does not match Theme.Colors.textPrimary

Suggested fixes:
  • Use Theme.Spacing values for all layout constants
  • Apply Theme.Colors consistently

Diff image: ~/.agentic-workflow/<repo-slug>/design/diff-<screen>-ios.png
```

### Major Discrepancies (> 10%):
```
[FAIL] Major iOS Discrepancies Found
======================================

Screen:   <screen-name>
Diff:     <N>%

Priority fixes:
  1. [HIGH] Layout structure differs from mockup
  2. [HIGH] Color scheme not applied — using system defaults
  3. [MED]  Typography scale doesn't match design tokens

Diff image: ~/.agentic-workflow/<repo-slug>/design/diff-<screen>-ios.png

Recommended: Run /design-implement-ios to regenerate components, then /design-verify-ios again.
```

## Step 8: Release Simulator Lock

```bash
release_lock
```

## Rules

- Compare against the latest baseline
- Report exact differences (element sizes, colors, spacing) when detectable from the diff
- Do not modify any code — this skill is read-only verification
- If the simulator is in an unexpected state (wrong screen, system dialog), note it and ask the user to navigate to the correct screen
