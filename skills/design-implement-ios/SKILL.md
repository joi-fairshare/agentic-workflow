---
name: design-implement-ios
description: Generate SwiftUI Theme.swift and view components from an approved iOS mockup using design-tokens.json. Supports light/dark color schemes following iOS HIG.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Bash(git *), AskUserQuestion
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

# Design Implement iOS — Generate SwiftUI Code from Mockup

Generate production-ready SwiftUI code from an approved mockup, using `design-tokens.json` to create a `Theme.swift` file and typed view components.

## Step 1: Validate Prerequisites

Both `design-tokens.json` and at least one mockup source must exist.

Check for the PNG baseline captured by `/design-mockup-ios`:
```bash
ls ~/.agentic-workflow/$REPO_SLUG/design/mockup-ios.png 2>/dev/null
```

If it does not exist:
> "No iOS mockup found. Run `/design-mockup-ios` first to capture a baseline screenshot."

If multiple Swift mockup files exist, ask via AskUserQuestion which to implement.

## Step 2: Generate Theme.swift

Create `Theme.swift` at the project root (or app target folder):

```swift
// Theme.swift — generated by /design-implement-ios
// Source: design-tokens.json
import SwiftUI

enum Theme {
    // MARK: - Colors
    enum Colors {
        // Primary palette
        static let primary = Color(hex: "<color.primary.$value>")
        static let primaryDark = Color(hex: "<color.primary-dark.$value>")
        static let background = Color(hex: "<color.background.$value>")
        static let surface = Color(hex: "<color.surface.$value>")
        static let textPrimary = Color(hex: "<color.text-primary.$value>")
        static let textSecondary = Color(hex: "<color.text-secondary.$value>")
        static let accent = Color(hex: "<color.accent.$value>")
        static let error = Color(hex: "<color.error.$value>")
        // ... all color tokens from design-tokens.json
    }

    // MARK: - Typography
    enum Typography {
        static let headingLarge = Font.system(size: <heading.large.fontSize>, weight: .bold)
        static let headingMedium = Font.system(size: <heading.medium.fontSize>, weight: .semibold)
        static let body = Font.system(size: <body.fontSize>, weight: .regular)
        static let caption = Font.system(size: <caption.fontSize>, weight: .regular)
        // ... all typography tokens
    }

    // MARK: - Spacing
    enum Spacing {
        static let xs: CGFloat = <spacing.xs value in points>
        static let sm: CGFloat = <spacing.sm value in points>
        static let md: CGFloat = <spacing.md value in points>
        static let lg: CGFloat = <spacing.lg value in points>
        static let xl: CGFloat = <spacing.xl value in points>
        // ... all spacing tokens
    }

    // MARK: - Corner Radius
    enum Radius {
        static let sm: CGFloat = <radius.sm>
        static let md: CGFloat = <radius.md>
        static let lg: CGFloat = <radius.lg>
    }
}

// MARK: - Color Hex Extension
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6: (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default: (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(.sRGB, red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255, opacity: Double(a) / 255)
    }
}
```

Write `Theme.swift` to the project root (or the main app target directory if identifiable).

## Step 3: Generate SwiftUI View Components

Using the mockup as visual reference and `Theme.*` values:

- Generate SwiftUI views for the approved mockup screen
- Import and use `Theme.Colors`, `Theme.Typography`, `Theme.Spacing`
- Use semantic SwiftUI view hierarchy (VStack, HStack, LazyVGrid as appropriate)
- Follow iOS HIG: NavigationStack, proper safe area handling, `.font()` modifiers
- Support light and dark color schemes via `@Environment(\.colorScheme)` where needed
- Use `.foregroundColor(Theme.Colors.textPrimary)` not hardcoded color values

Reference `.impeccable.md` (if present) for brand personality — spacing density, interaction patterns.

## Step 4: Validate

Check that:
- No hardcoded hex values appear in view files (all colors reference `Theme.Colors.*`)
- No hardcoded CGFloat values for spacing (all reference `Theme.Spacing.*`)
- All font uses reference `Theme.Typography.*`

## Step 5: Report

```
iOS Implementation Complete
============================

Mockup:    Mockup.swift / mockup-ios.png

Generated:
  Theme.swift              (Color, Typography, Spacing, Radius extensions)
  <list of created view files>

Next steps:
  • Run /design-verify-ios to compare implementation against the mockup baseline
  • Run /design-refine to apply Impeccable refinements
  • Commit generated files: git add Theme.swift <components>
```

## Rules

- `Theme.swift` always goes at the project root or the main app target folder — never in a test target
- Never hardcode values that exist in `design-tokens.json`
- Do not modify `design-tokens.json` — it is the source of truth
- If the project has existing color definitions (Asset catalog, extension), note any conflicts rather than silently overwriting
