---
name: design-verify-web
description: Playwright screenshots at mobile/tablet/desktop viewports, diff against mockup baseline using design-comparison MCP, and report discrepancies with fix suggestions.
---

<!-- MEMORY: SKIP -->
## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.
Read [the shared design preamble](../_design-preamble.md) before continuing.

---

# Design Verify Web — Playwright Screenshot Diff vs Mockup

Captures screenshots of the live implementation, compares against the mockup baseline, and reports discrepancies with prioritized fix suggestions.

## Step 1: Load Baselines

Find mockup baselines in the design output directory:

```
Glob("~/.agentic-workflow/<repo-slug>/design/mockup-*.png")
```

**Filtering by screen-name:** If a `[screen-name]` argument was provided (e.g., `design-verify-web dashboard`), filter the baselines to only those matching `mockup-<screen-name>.png`. If no argument was provided, verify all baselines found.

If no baselines match (either no baselines exist, or the specified screen-name has no baseline):
> "No mockup baselines found. Run `design-mockup-web <screen-name>` first to create a baseline."

## Step 2: Acquire Browser Lock

Source the browser lockfile script and acquire the lock before running any Playwright actions:

```bash
SKILL_DIR="$(dirname "$(readlink -f "$HOME/.codex/skills/verify-web/SKILL.md")")"
source "$SKILL_DIR/browser-lock.sh"
acquire_browser_lock
```

If the lock cannot be acquired (timeout), report:
> "Another browser verification session is in progress. Wait for it to finish or remove `~/.agentic-workflow/.browser.lock` if stale."

**Important:** Always release the lock when done, even on errors. If any subsequent step fails, release the lock before exiting.

## Step 3: Capture Implementation Screenshots

Capture screenshots at multiple viewports directly in the current session. If the user explicitly asked for delegated design iteration, you may hand this capture step to a sub-agent, but local execution is the default:

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

Suggested fix path: Run `design-refine` to address discrepancies, then `design-verify-web` again.

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

Recommended: run `design-refine`, then re-run `design-verify-web`. If the user explicitly asked for delegated design iteration, you may also hand the follow-up refinement to a design-focused sub-agent.
```

## Step 6: Release Browser Lock

Always release the lock after screenshot capture completes, regardless of success or failure:

```bash
release_browser_lock
```

## Rules

- Always compare against the latest baseline — warn if the baseline is older than the most recent mockup HTML
- Capture all configured viewports, don't skip any
- Report exact pixel values and token references for each discrepancy
- For major diffs, suggest the `design-iterator` compound-engineering agent as an automated fix path
- Do not modify any code — this skill is read-only verification
- If the dev server is not running, advise the user to start it before re-running
