---
name: design-mockup-ios
description: Generate a Mockup.swift SwiftUI preview file from design tokens, build and run on simulator via XcodeBuildMCP, capture a screenshot as the baseline for /design-verify-ios.
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

# Design Mockup iOS — SwiftUI Preview Mockup Generator

Generates a `Mockup.swift` SwiftUI preview file from design tokens, builds on simulator, and captures a baseline screenshot for verification.

## Step 1: Validate Prerequisites

`design-tokens.json` must exist. If missing:
> "No design tokens found. Run `/design-analyze-ios` first to extract tokens from your Xcode assets."

## Step 2: Read Design Context

Read `design-tokens.json` and (if present) `.impeccable.md` to understand:
- Color palette
- Typography scale
- Spacing system
- Brand personality

## Step 3: Generate Mockup.swift

Create a `Mockup.swift` SwiftUI preview file at the project root (or in the main app target folder if detected):

```swift
// Mockup.swift — generated by /design-mockup-ios
// This file is a design mockup preview — not production code.
import SwiftUI

// MARK: - Design Tokens (inline for preview isolation)
private enum MockupTokens {
    enum Color {
        static let primary = SwiftUI.Color(hex: "<primary from design-tokens.json>")
        static let background = SwiftUI.Color(hex: "<background from design-tokens.json>")
        // ... all color tokens
    }
    enum Spacing {
        static let sm: CGFloat = <sm value>
        static let md: CGFloat = <md value>
        // ... all spacing tokens
    }
    enum Typography {
        static let heading = Font.system(size: <heading size>, weight: .bold)
        // ... all typography tokens
    }
}

// MARK: - Mockup View
struct MockupView: View {
    var body: some View {
        // Generate a representative view using the design tokens
        // Use realistic placeholder content (not "Lorem ipsum")
        // Follow iOS HIG: safe areas, standard navigation, system fonts as fallback
    }
}

#Preview {
    MockupView()
}
```

The mockup should use ALL color, spacing, and typography tokens to demonstrate the full design language.

## Step 4: Acquire Simulator Lock

Acquire the simulator lock to prevent concurrent sessions from corrupting screenshots:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-mockup-ios/SKILL.md")")/../_shared"
LOCK_NAME=ios-sim
source "$SHARED_DIR/skill-lock.sh"
acquire_lock || { echo "Could not acquire simulator lock — another skill may be using the simulator"; exit 1; }
```

On any failure in subsequent steps, call `release_lock` before stopping.

## Step 5: Build on Simulator

Build the project on simulator:
```
xcodebuildmcp: build_ios_sim
```

If the build fails:
> "Build failed. Fix compilation errors before running `/design-mockup-ios` again. Error details: [paste build output]"
Call `release_lock` and stop here — do not write a baseline.

## Step 6: Launch App on Simulator

Use XcodeBuildMCP:
```
xcodebuildmcp: list_sims
```

If no simulator is booted or the app is not running:
```
xcodebuildmcp: launch_app_sim (with app bundle ID)
```

If the app bundle ID can't be determined from the project, ask via AskUserQuestion.

## Step 7: Capture Baseline Screenshot

Once the app is running with the mockup visible:
```
xcodebuildmcp: screenshot
```

```bash
mkdir -p "$HOME/.agentic-workflow/$REPO_SLUG/design"
```

Save the screenshot to:
```
~/.agentic-workflow/<repo-slug>/design/mockup-ios.png
```

If a baseline already exists, ask via AskUserQuestion:
> "A baseline already exists at mockup-ios.png. Overwrite? (yes/no)"

## Step 8: Report

```
iOS Mockup Baseline Created
============================

File:      Mockup.swift
Baseline:  ~/.agentic-workflow/<repo-slug>/design/mockup-ios.png

Next steps:
  • Run /design-implement-ios to generate production Theme.swift and SwiftUI components
  • Run /design-verify-ios to compare implementation against this baseline
```

## Step 9: Release Simulator Lock

```bash
release_lock
```

## Rules

- `Mockup.swift` is a design artifact, not production code — optimize for visual completeness, not code quality
- Inline all design tokens directly in the file so the preview is self-contained
- If the project doesn't build, report the error and stop — never write a baseline from a broken build
- Delete `Mockup.swift` after capturing the baseline (it's a temporary file). Advise the user if the file should be kept for iterative work.
