---
name: design-verify-ios
description: Boot simulator if needed, capture screenshot via XcodeBuildMCP, diff against mockup baseline using design-comparison MCP. Reports discrepancies with fix suggestions.
---

<!-- MEMORY: SKIP -->
## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.
Read [the shared design preamble](../_design-preamble.md) before continuing.

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
> "No iOS mockup baselines found. Run `design-mockup-ios` first to create a baseline."

## Step 2: Acquire Simulator Lock

Acquire the simulator lock to prevent concurrent sessions from corrupting screenshots:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.codex/skills/design-verify-ios/SKILL.md")")/../_shared"
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

If the app bundle ID can't be determined, ask the user directly.

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

Recommended: Run design-implement-ios to regenerate components, then design-verify-ios again.
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
