---
name: design-implement-web
description: Generate web production code from an approved mockup using Design Token Bridge MCP for CSS/Tailwind token files. React/Next.js component generation with full token coverage.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Bash(git *), Bash(npx design-token-bridge-mcp *), AskUserQuestion
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

# Design Implement Web — Generate Production Code from Mockup

Generate production-ready code from an approved mockup, using the Design Token Bridge MCP to create platform-specific token files.

## Step 1: Select Mockup

Locate mockup sources in priority order — HTML source files are far more useful for code generation than PNG screenshots.

### 1a: Discover HTML mockups (preferred)

Use the `Glob` tool with a recursive pattern to find HTML files in session subdirectories:

```
Glob(".superpowers/brainstorm/**/*.html")
```

HTML mockups contain the full layout structure, CSS, and component hierarchy generated by `/design-mockup`. These are the primary source for code generation.

### 1b: Discover PNG baselines (fallback)

```bash
ls ~/.agentic-workflow/$REPO_SLUG/design/mockup-*.png 2>/dev/null
```

PNG baselines are screenshot captures stored in the centralized output directory. Use these only when the HTML source is unavailable.

### 1c: Select which mockup to implement

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

## Step 2: Generate Token Files

Convert `design-tokens.json` into platform-specific files using the Design Token Bridge.

**Invocation strategy — try MCP tools first, fall back to npx CLI:**

1. **MCP tools (preferred):** If the Design Token Bridge MCP server is available (i.e., it appears in the active MCP server list as `design-token-bridge`), call its tools directly using the `mcp__design-token-bridge__<tool>` form. Direct MCP invocation is faster, avoids spawning a subprocess, and is the architecturally correct path when the server is already registered.

2. **npx CLI (fallback):** If the MCP server is not available, shell out via `Bash(npx design-token-bridge-mcp <command>)`. This works without any prior server registration and is the safe fallback for environments where the MCP server has not been configured.

Call (or shell out to) these tools in order:
1. `mcp__design-token-bridge__generate_css_variables` / `npx design-token-bridge-mcp generate-css-variables` — produces `tokens.css` (CSS custom properties with dark mode variants)
2. `mcp__design-token-bridge__generate_tailwind_config` / `npx design-token-bridge-mcp generate-tailwind-config` — produces `tailwind.preset.js` (Tailwind preset using token values)

Both files are written to the project root.

## Step 3: Generate Component Code

Using the mockup as visual reference and the generated token files:

- Generate React/Next.js components (or plain HTML/CSS if no framework detected)
- Import from `tokens.css` or use Tailwind classes from the preset
- Follow the component structure visible in the mockup
- Use semantic HTML elements
- Include responsive breakpoints matching the mockup

Reference `.impeccable.md` for design personality — spacing density, animation approach, interaction patterns.

## Step 4: Validate

Run basic checks:
- Ensure no hardcoded color/spacing values (all should reference tokens)

## Step 5: Report

```
Implementation Complete
=======================

Target:    web
Mockup:    mockup-<screen-name>.png

Generated token files:
  tokens.css              (CSS custom properties)
  tailwind.preset.js      (Tailwind preset)

Generated components:
  <list of created/modified component files>

Next steps:
  • Run /design-refine [colorize|polish|typeset] to refine the implementation
  • Run /design-verify-web to compare implementation against the mockup
  • Commit generated token files: git add tokens.css tailwind.preset.js
```

## Rules

- Generated token files (`tokens.css`, `tailwind.preset.js`) always go at project root
- Never hardcode values that exist in `design-tokens.json` — always reference the generated token files
- If Design Token Bridge MCP is not available, fall back to manual token file generation from `design-tokens.json`
- Do not modify `design-tokens.json` — it is the source of truth
- If the mockup HTML is available, use it as the primary reference for layout and structure
