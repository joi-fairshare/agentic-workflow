---
name: design-verify
description: Screenshot the live implementation, diff against the approved mockup baseline using design-comparison MCP, and report discrepancies with fix suggestions. Detects web vs iOS automatically.
argument-hint: [screen-name]
disable-model-invocation: true
allowed-tools: Read, Write, Glob, Agent, AskUserQuestion
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

# Design Verify — Screenshot Diff Implementation vs Mockup

Captures screenshots of the live implementation, compares against the mockup baseline, and reports discrepancies with prioritized fix suggestions.

## Step 1: Detect Target Platform

Check project files to determine the target:

- **iOS indicators:** `Package.swift`, `*.xcodeproj`, `*.xcworkspace` → use mobai MCP
- **Web indicators:** `package.json` with Next.js/React/Vue dependencies → use Playwright MCP
- **Both present:** run verification for both platforms

Use `Glob` and `Read` tools to detect the platform:

```
# Check for iOS
Glob("Package.swift")
Glob("*.xcodeproj")
Glob("*.xcworkspace")

# Check for web (read package.json dependencies)
Read("package.json")
```

## Step 2: Load Baselines

Find mockup baselines in the design output directory:

```
Glob("~/.agentic-workflow/<repo-slug>/design/mockup-*.png")
```

**Filtering by screen-name:** If a `[screen-name]` argument was provided (e.g., `/design-verify dashboard`), filter the baselines to only those matching `mockup-<screen-name>.png`. If no argument was provided, verify all baselines found.

If no baselines match (either no baselines exist, or the specified screen-name has no baseline):
> "No mockup baselines found. Run `/design-mockup <screen-name>` first to create a baseline."

## Step 3: Capture Implementation Screenshots

### For Web (Playwright MCP):

Spawn an Agent to capture screenshots at multiple viewports:

1. Navigate to the implementation URL (detect from `package.json` scripts, typically `http://localhost:3000`)
2. Capture at standard viewports:
   - Mobile: 375×812 (iPhone)
   - Tablet: 768×1024 (iPad)
   - Desktop: 1440×900
3. Save each screenshot:
   ```
   ~/.agentic-workflow/<repo-slug>/design/impl-<screen>-mobile.png
   ~/.agentic-workflow/<repo-slug>/design/impl-<screen>-tablet.png
   ~/.agentic-workflow/<repo-slug>/design/impl-<screen>-desktop.png
   ```

The agent should use Playwright MCP tools: `browser_navigate`, `browser_resize`, `browser_take_screenshot`.

### For iOS (mobai MCP):

Spawn an Agent to capture simulator screenshots:

1. Use `get_screenshot` to capture the current screen
2. Save screenshot:
   ```
   ~/.agentic-workflow/<repo-slug>/design/impl-<screen>-ios.png
   ```

## Step 4: Diff Against Baselines

For each implementation screenshot, call the design-comparison MCP tool `compare_design` with these parameters:

- **reference:** `~/.agentic-workflow/<repo-slug>/design/mockup-<screen>.png`
- **implementation:** `~/.agentic-workflow/<repo-slug>/design/impl-<screen>-<viewport>.png`

The MCP returns:
- Pixel diff percentage
- Diff image highlighting differences

Save diff images:
```
~/.agentic-workflow/<repo-slug>/design/diff-<screen>-<viewport>.png
```

## Step 5: Report Results

### Pass (< 2% diff):

```
[PASS] Verification Passed
===========================

Screen:     <screen-name>
Diff:       <N>% (threshold: 2%)
Viewports:  mobile [pass], tablet [pass], desktop [pass]

Implementation matches the approved mockup.
```

### Minor Discrepancies (2–10% diff):

```
[WARN] Minor Discrepancies Found
==================================

Screen:     <screen-name>
Diff:       <N>%

Discrepancies:
  1. [viewport] Header height differs by ~8px (impl: 64px, mockup: 72px)
  2. [viewport] Button border-radius uses 4px instead of token value 8px
  3. [viewport] Body text color is #333 instead of token color.text (#1A1A2E)

Suggested fixes:
  • Update header height to match spacing.header token
  • Replace hardcoded border-radius with var(--radius-md)
  • Use var(--color-text) instead of hardcoded #333

Suggested fix path: Run `/design-refine` to address discrepancies, then `/design-verify` again.

Diff images saved to ~/.agentic-workflow/<repo-slug>/design/
```

### Major Discrepancies (> 10% diff):

```
[FAIL] Major Discrepancies Found
==================================

Screen:     <screen-name>
Diff:       <N>%

This is a significant deviation from the mockup.

Priority fixes:
  1. [HIGH] Layout structure differs — sidebar missing in implementation
  2. [HIGH] Color scheme not applied — implementation uses default colors
  3. [MED]  Typography scale doesn't match design tokens
  4. [LOW]  Icon sizes inconsistent

Diff images saved to ~/.agentic-workflow/<repo-slug>/design/

Recommended: Run the design-iterator agent for automated multi-pass refinement:
  Use Agent tool with compound-engineering:design:design-iterator subagent
```

## Rules

- Always compare against the latest baseline — warn if the baseline is older than the most recent mockup HTML
- Capture all configured viewports, don't skip any
- Report exact pixel values and token references for each discrepancy
- For major diffs, suggest the `design-iterator` compound-engineering agent as an automated fix path
- Do not modify any code — this skill is read-only verification
- If the dev server is not running, advise the user to start it before re-running
