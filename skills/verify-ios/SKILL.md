---
name: verify-ios
description: "XcodeBuildMCP-based iOS simulator verification. Default: snapshot_ui (view hierarchy structured check). --visual: screenshot for pixel inspection. Auto mode infers screens from Swift file changes in git diff."
---

## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.

---

# Verify iOS — XcodeBuildMCP Simulator Verification

Verifies iOS app behavior on simulator using XcodeBuildMCP. Default mode captures the UI hierarchy for structural checks. `--visual` captures screenshots for pixel inspection.

## Step 1: Parse Arguments

Parse the command arguments:

- **`--visual`** — Use `screenshot` instead of `snapshot_ui`. Useful for visual regression and layout checks.
- **Explicit criteria** — Any text after flags is treated as verification criteria (e.g., `verify-ios the login screen should show a validation error`)
- **`auto`** — Infer what to verify from recent Swift file changes (diff-inference mode)
- **No arguments** — Same as `auto`

Set two variables:
- `MODE`: either `"explicit"` or `"auto"`
- `VISUAL`: `true` if `--visual` was passed, `false` otherwise

## Step 2: Ensure Simulator Is Running

Use XcodeBuildMCP to check for a running simulator:

```
xcodebuildmcp: list_sims
```

If no simulator is booted:
1. Select the most recent iPhone simulator from the list
2. Call `xcodebuildmcp: launch_app_sim` with the app bundle ID (read from `*.xcodeproj` or `Package.swift` if available)
3. If the app bundle ID can't be determined, ask the user directly: "No running simulator found. Please start your app in the iOS Simulator and retry, or provide the app bundle ID:"
4. Wait for the simulator to boot (check `list_sims` again)

## Step 3: Acquire Simulator Lock

Source the shared lockfile script and acquire the lock before interacting with the simulator:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.codex/skills/verify-ios/SKILL.md")")/../_shared"
LOCK_NAME=ios-sim
source "$SHARED_DIR/skill-lock.sh"
acquire_lock
```

If the lock cannot be acquired (timeout), report:
> "Another iOS simulator session is in progress. Wait for it to finish or remove `~/.agentic-workflow/.ios-sim.lock` if stale."

**Important:** Always release the lock when done, even on errors. If any step fails, jump to Step 7 to release the lock before exiting.

## Step 4: Build Verification Plan

### Explicit Mode

Parse criteria into a checklist. Each item should identify:
- A screen or UI state to check
- An expected element or behavior
- A pass/fail condition

Example: "the login screen should show a validation error when email is empty"
→ Plan: Navigate to login, trigger empty-email submit, check for error text in UI tree.

### Auto Mode (Diff-Inference)

Infer what to verify from recent Swift file changes:

```bash
git diff --name-only HEAD~3..HEAD
git log --oneline -5
```

For each changed `.swift` file, determine affected screens:
- **View files** (`*View.swift`, `*ViewController.swift`) → verify those screens render
- **Model/ViewModel changes** → verify the data appears correctly in the UI
- **Navigation changes** → verify navigation paths work
- **Style changes** → recommend `--visual` if not already set

Build a verification plan with 3–8 checks. Present to user:

> **iOS Verification plan** (based on recent Swift changes):
>
> 1. Check LoginView — error message element visible after failed submit
> 2. Check HomeView — user name label shows correct value
> ...
>
> **Proceed? (yes / edit / add more)**

Wait for confirmation before executing.

## Step 5: Execute Verification

### Default Mode (UI Hierarchy — `snapshot_ui`)

For each verification step:

1. **Capture UI tree**: `xcodebuildmcp: snapshot_ui`
2. **Analyze**: Parse the view hierarchy for expected elements:
   - Check for specific labels, buttons, navigation titles
   - Verify accessibility identifiers if present
   - Check for error messages, loading states, empty states
3. **Interact** (if needed): Use `xcodebuildmcp: tap` or `xcodebuildmcp: swipe` to trigger interactions, then `snapshot_ui` again
4. **Record result**: Pass/fail with element path and expected vs actual

### Visual Mode (`--visual`)

For each verification step:

1. **Screenshot**: `xcodebuildmcp: screenshot`
2. **Analyze**: Examine screenshot for layout, content, visual styling
3. **Interact** (if needed): `xcodebuildmcp: tap` or `xcodebuildmcp: swipe`, then screenshot again
4. **Save screenshot**: Write to `~/.agentic-workflow/$REPO_SLUG/verification/`
5. **Record result**: Pass/fail with details

Screenshot naming:
```
verification/{timestamp}-{check-number}-{slug}-ios.png
```

## Step 6: Report Results

Generate a structured report:

```
iOS Verification Report
=======================

App:     {app name from xcodeproj/Package.swift}
Mode:    {explicit | auto (diff-inference)}
Method:  {UI hierarchy | visual (screenshots)}
Date:    {ISO date}

Results: {N passed} / {M total} checks

  [PASS] 1. LoginView — error label "Email is required" found in hierarchy
  [FAIL] 2. HomeView — username label not found
         Expected: Label with text matching user.name
         Found: No matching element in UI tree

Issues Found:
  1. [FAIL] HomeView missing username label
     Expected: Label showing authenticated user name
     Suggestion: Check that HomeViewModel binds user.name to the label

{If --visual: Screenshots saved to ~/.agentic-workflow/<repo-slug>/verification/}
```

Write report to:
```
~/.agentic-workflow/$REPO_SLUG/verification/{timestamp}-ios-report.md
```

## Step 7: Release Simulator Lock

Always release the lock, regardless of success or failure:

```bash
release_lock
```

## Rules

- **UI hierarchy by default** — `snapshot_ui` is faster and catches structural issues. Only use `screenshot` with `--visual`.
- **Never modify code** — read-only verification. Report issues, don't fix them.
- **In auto mode, always confirm the plan** before executing.
- **If simulator isn't running**, ask the user rather than attempting to build the project from scratch.
- **Always release the simulator lock** — even if verification fails partway through. A leaked lock blocks all future verification sessions.
