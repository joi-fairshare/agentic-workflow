---
name: design-analyze-ios
description: Scan Assets.xcassets and Swift theme files to extract design tokens (colors, typography, spacing) into design-tokens.json in W3C DTCG format. Pass a specific path or let the skill auto-discover.
argument-hint: [path/to/Assets.xcassets or Theme.swift]
disable-model-invocation: true
allowed-tools: Read, Write, Glob, AskUserQuestion
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

> **Note:** This skill creates design context — missing `design-tokens.json` is expected on first run.

---

# Design Analyze iOS — Extract Design Tokens from Swift/Xcode Assets

Scans the Xcode project for color, typography, and spacing definitions and writes `design-tokens.json` in W3C DTCG format.

## Step 1: Locate Source Files

### With explicit path argument:
Use the provided path directly (an `Assets.xcassets` directory or a `*Theme*.swift` / `*Colors*.swift` file).

### Without argument (auto-discover):
Use Glob to find:
```
Glob("**/*.xcassets")
Glob("**/*Theme*.swift")
Glob("**/*Colors*.swift")
Glob("**/*Color*.swift")
```

If nothing is found:
> "No Swift color definitions or asset catalogs found. Start your project and add a color asset catalog or a theme file, then re-run."

## Step 2: Extract Color Tokens

### From `Assets.xcassets`:
Read each `.colorset/Contents.json` file. Extract:
- Color name (from directory name)
- Light mode RGBA values
- Dark mode RGBA values (if present)
- Convert to hex string format

### From Swift theme files:
Read the file and parse patterns like:
- `static let primaryColor = Color(hex: "#...")` → extract hex
- `Color(red: N, green: N, blue: N)` → convert to hex
- `Color(.systemBlue)` → note as system color
- `static var background: Color { ... }` → extract color name and value

## Step 3: Extract Typography Tokens (if present)

Look for patterns in Swift theme files:
- `Font.system(size: N, weight: .bold)` → extract size and weight
- `static let headingFont = Font.custom("...", size: N)` → font family + size
- `UIFont.systemFont(ofSize: N, weight: ...)` → size and weight

## Step 4: Extract Spacing Tokens (if present)

Look for numeric constants used as spacing:
- `static let padding: CGFloat = N` → spacing token
- `static let cornerRadius: CGFloat = N` → radius token
- Struct or enum with spacing values

## Step 5: Write design-tokens.json

If `design-tokens.json` already exists, ask via AskUserQuestion:
> "design-tokens.json already exists. Overwrite with extracted iOS tokens? (yes/no)"

Write extracted tokens in W3C DTCG format:

```json
{
  "$schema": "https://design-tokens.org/schema.json",
  "color": {
    "primary": { "$value": "#6366F1", "$type": "color" },
    "primary-dark": { "$value": "#818CF8", "$type": "color" },
    "background": { "$value": "#FFFFFF", "$type": "color" }
  },
  "typography": {
    "heading": {
      "fontSize": { "$value": "28px", "$type": "dimension" },
      "fontWeight": { "$value": "700", "$type": "number" }
    }
  },
  "spacing": {
    "sm": { "$value": "8px", "$type": "dimension" },
    "md": { "$value": "16px", "$type": "dimension" },
    "lg": { "$value": "24px", "$type": "dimension" }
  }
}
```

If no Swift color definitions existed (only asset catalog):
> "Created design-tokens.json from color assets only. Typography and spacing tokens could not be auto-extracted — add them manually or create a theme file."

## Step 6: Present Summary

```
iOS Design Token Extraction Complete
=====================================

Sources scanned:
  {list of files read}

Colors:     N tokens extracted
Typography: N tokens extracted (or: not found)
Spacing:    N tokens extracted (or: not found)

Written to: design-tokens.json

Next steps:
  1. Run /design-language to define brand personality
  2. Run /design-mockup-ios to generate a SwiftUI preview mockup
  3. Run /design-implement-ios to generate Theme.swift
```

## Rules

- Never infer colors from view background or text color assignments — only extract explicit theme/constant definitions
- If Swift files use system colors (`Color(.systemBlue)`) without a custom equivalent, note them in the output but do not add a token for them
- Do not modify existing Swift files — read-only extraction
- Convert all CGFloat dimensions to `"Npx"` string format for DTCG compatibility
