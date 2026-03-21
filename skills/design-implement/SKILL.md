---
name: design-implement
description: Generate production code from an approved mockup using Design Token Bridge MCP for platform-specific token files. Supports web (CSS/Tailwind/Next.js) and SwiftUI targets. Interactive mockup selection when multiple exist.
argument-hint: <target> (web | swiftui)
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Bash(git *), Bash(npx *), AskUserQuestion
---

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
```

## Design Context — Load Design Language

Before proceeding, load existing design context:

1. Read `.impeccable.md` if it exists (brand personality, aesthetic direction)
2. Read `design-tokens.json` if it exists (W3C DTCG tokens: colors, typography, spacing)
3. Read `planning/DESIGN_SYSTEM.md` if it exists (design principles, component catalog)

If none of these files exist and this skill requires design context to function, advise:
> "No design language found. Run `/design-analyze <url>` to extract tokens from a reference site, then `/design-language` to define brand personality."

---

# Design Implement — Generate Production Code from Mockup

Generate production-ready code from an approved mockup, using the Design Token Bridge MCP to create platform-specific token files.

## Step 1: Validate Arguments

The user must provide a target: `web` or `swiftui`.

If no target or invalid target:
> "Usage: `/design-implement <target>`
> Targets: `web` (CSS variables + Tailwind config) or `swiftui` (Theme.swift)"

## Step 2: Select Mockup

List approved mockups from the design output directory:

```bash
ls ~/.agentic-workflow/$REPO_SLUG/design/mockup-*.png 2>/dev/null
```

- **No mockups found:** advise running `/design-mockup <screen-name>` first
- **One mockup:** use it automatically
- **Multiple mockups:** present the list and ask via AskUserQuestion which one to implement:
  > "Multiple approved mockups found:
  > 1. mockup-dashboard.png
  > 2. mockup-login.png
  > 3. mockup-settings.png
  > Which mockup should I implement? (number or name)"

Also read the corresponding HTML mockup file from `.superpowers/brainstorm/` if it still exists.

## Step 3: Generate Token Files

Use the Design Token Bridge MCP to convert `design-tokens.json` into platform-specific files.

### For `web` target:

Call these MCP tools:
1. `generate_css_variables` — produces `tokens.css` (CSS custom properties with dark mode variants)
2. `generate_tailwind_config` — produces `tailwind.preset.js` (Tailwind preset using token values)

Both files are written to the project root.

### For `swiftui` target:

Call this MCP tool:
1. `generate_swiftui_theme` — produces `Theme.swift` (Color, Font, Spacing extensions)

Written to the project root.

## Step 4: Generate Component Code

Using the mockup as visual reference and the generated token files:

### For `web`:
- Generate React/Next.js components (or plain HTML/CSS if no framework detected)
- Import from `tokens.css` or use Tailwind classes from the preset
- Follow the component structure visible in the mockup
- Use semantic HTML elements
- Include responsive breakpoints matching the mockup

### For `swiftui`:
- Generate SwiftUI views
- Use `Theme.colors`, `Theme.fonts`, `Theme.spacing` from the generated `Theme.swift`
- Follow iOS HIG conventions
- Support both light and dark color schemes

Reference `.impeccable.md` for design personality — spacing density, animation approach, interaction patterns.

## Step 5: Validate

Run basic checks:
- Web: ensure no hardcoded color/spacing values (all should reference tokens)
- SwiftUI: ensure all theme references compile

## Step 6: Report

```
Implementation Complete
=======================

Target:    <web|swiftui>
Mockup:    mockup-<screen-name>.png

Generated token files:
  tokens.css              (CSS custom properties)
  tailwind.preset.js      (Tailwind preset)
  — or —
  Theme.swift             (SwiftUI theme extensions)

Generated components:
  <list of created/modified component files>

Next steps:
  • Run /design-refine [colorize|polish|typeset] to refine the implementation
  • Run /design-verify to compare implementation against the mockup
  • Commit generated token files: git add tokens.css tailwind.preset.js
```

## Rules

- Generated token files (`tokens.css`, `tailwind.preset.js`, `Theme.swift`) always go at project root
- Never hardcode values that exist in `design-tokens.json` — always reference the generated token files
- If Design Token Bridge MCP is not available, fall back to manual token file generation from `design-tokens.json`
- Do not modify `design-tokens.json` — it is the source of truth
- If the mockup HTML is available, use it as the primary reference for layout and structure
