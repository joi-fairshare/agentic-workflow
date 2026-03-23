---
name: design-implement
description: Generate production code from an approved mockup using Design Token Bridge MCP for platform-specific token files. Supports web (CSS/Tailwind/Next.js) and SwiftUI targets. Interactive mockup selection when multiple exist.
argument-hint: <target> (web | swiftui)
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Bash(git *), Bash(npx design-token-bridge-mcp *), AskUserQuestion
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

# Design Implement — Generate Production Code from Mockup

Generate production-ready code from an approved mockup, using the Design Token Bridge MCP to create platform-specific token files.

## Step 1: Validate Arguments

The user must provide a target: `web` or `swiftui`.

If no target or invalid target:
> "Usage: `/design-implement <target>`
> Targets: `web` (CSS variables + Tailwind config) or `swiftui` (Theme.swift)"

## Step 2: Select Mockup

Locate mockup sources in priority order — HTML source files are far more useful for code generation than PNG screenshots.

### 2a: Discover HTML mockups (preferred)

Use the `Glob` tool with a recursive pattern to find HTML files in session subdirectories:

```
Glob(".superpowers/brainstorm/**/*.html")
```

HTML mockups contain the full layout structure, CSS, and component hierarchy generated by `/design-mockup`. These are the primary source for code generation.

### 2b: Discover PNG baselines (fallback)

```bash
ls ~/.agentic-workflow/$REPO_SLUG/design/mockup-*.png 2>/dev/null
```

PNG baselines are screenshot captures stored in the centralized output directory. Use these only when the HTML source is unavailable.

### 2c: Select which mockup to implement

Merge both discovery results into a single list, annotating the source type:

- **No mockups found (neither HTML nor PNG):** advise running `/design-mockup <screen-name>` first
- **One mockup:** use it automatically (prefer the HTML version if both HTML and PNG exist for the same screen)
- **Multiple mockups:** present the combined list and ask via AskUserQuestion which one to implement:
  > "Available mockups:
  > 1. mockup-dashboard.html (HTML source — .superpowers/brainstorm/)
  > 2. mockup-login.html (HTML source — .superpowers/brainstorm/)
  > 3. mockup-settings.png (PNG baseline — ~/.agentic-workflow/…/design/)
  > Which mockup should I implement? (number or name)"

When an HTML source exists for a mockup, always use it as the primary reference. If a PNG baseline also exists for the same screen, it can serve as a supplementary visual reference but the HTML structure takes precedence for code generation.

## Step 3: Generate Token Files

Convert `design-tokens.json` into platform-specific files using the Design Token Bridge.

**Invocation strategy — try MCP tools first, fall back to npx CLI:**

1. **MCP tools (preferred):** If the Design Token Bridge MCP server is available (i.e., it appears in the active MCP server list as `design-token-bridge`), call its tools directly using the `mcp__design-token-bridge__<tool>` form. Direct MCP invocation is faster, avoids spawning a subprocess, and is the architecturally correct path when the server is already registered.

2. **npx CLI (fallback):** If the MCP server is not available, shell out via `Bash(npx design-token-bridge-mcp <command>)`. This works without any prior server registration and is the safe fallback for environments where the MCP server has not been configured.

### For `web` target:

Call (or shell out to) these tools in order:
1. `mcp__design-token-bridge__generate_css_variables` / `npx design-token-bridge-mcp generate-css-variables` — produces `tokens.css` (CSS custom properties with dark mode variants)
2. `mcp__design-token-bridge__generate_tailwind_config` / `npx design-token-bridge-mcp generate-tailwind-config` — produces `tailwind.preset.js` (Tailwind preset using token values)

Both files are written to the project root.

### For `swiftui` target:

Call (or shell out to) this tool:
1. `mcp__design-token-bridge__generate_swiftui_theme` / `npx design-token-bridge-mcp generate-swiftui-theme` — produces `Theme.swift` (Color, Font, Spacing extensions)

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
