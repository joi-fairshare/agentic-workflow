---
name: verify-app
description: "Playwright-based self-verification of running web apps. Two modes: explicit criteria or diff-inference from recent changes. Accessibility snapshots by default, --visual for screenshots."
argument-hint: "[--visual] [criteria or 'auto']"
disable-model-invocation: true
allowed-tools: Bash(git *), Agent, Read, Write, Glob, Grep, AskUserQuestion
---

# Verify App — Browser-Based Self-Verification

Launches Playwright against a running web app to verify behavior. Uses accessibility snapshots by default for fast, structured verification. Add `--visual` for screenshot-based visual checks.

> **Agentic Workflow** — 22 skills available. Run any as `/<name>`.
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
> | `/verify-app` | Playwright browser verification of running app |
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
for s in review postReview addressReview enhancePrompt bootstrap rootCause bugHunt bugReport shipRelease syncDocs weeklyRetro officeHours productReview archReview design-analyze design-language design-evolve design-mockup design-implement design-refine design-verify verify-app; do
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
mkdir -p "$HOME/.agentic-workflow/$REPO_SLUG/verification"
```

---

## Step 1: Parse Arguments

Parse the command arguments:

- **`--visual`** — Use screenshots (Playwright `browser_take_screenshot`) instead of accessibility snapshots. Useful for visual regression, layout checks, and design verification.
- **Explicit criteria** — Any text after flags is treated as verification criteria (e.g., `/verify-app the login form should show validation errors`)
- **`auto`** — Infer what to verify from recent git changes (diff-inference mode)
- **No arguments** — Same as `auto`

Set two variables:
- `MODE`: either `"explicit"` (criteria provided) or `"auto"` (infer from diff)
- `VISUAL`: `true` if `--visual` was passed, `false` otherwise

## Step 2: Detect the App URL

Determine where the app is running:

1. Read `package.json` — look for `scripts.dev` or `scripts.start` to identify the framework and default port
2. Common defaults:
   - Next.js: `http://localhost:3000`
   - Vite/React: `http://localhost:5173`
   - Angular: `http://localhost:4200`
   - Generic: `http://localhost:3000`
3. Check `CLAUDE.md` for documented URLs or ports

Verify the app is reachable using Playwright's `browser_navigate`. If the navigation fails:
> "The app doesn't appear to be running at {url}. Start the dev server and try again."

## Step 3: Acquire Browser Lock

Source the browser lockfile script and acquire the lock:

```bash
SKILL_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/verify-app/SKILL.md")")"
source "$SKILL_DIR/browser-lock.sh"
acquire_browser_lock
```

If the lock cannot be acquired (timeout), report:
> "Another browser verification session is in progress. Wait for it to finish or remove `~/.agentic-workflow/.browser.lock` if stale."

**Important:** Always release the lock when done, even on errors. Wrap all subsequent steps in a try/finally pattern — if any step fails, jump to Step 7 to release the lock before exiting.

## Step 4: Build Verification Plan

### Explicit Mode

The user provided specific criteria. Parse them into a checklist of things to verify. Each item should be:
- A page or route to visit
- An expected behavior or element to check
- A pass/fail condition

Example criteria: "the login form should show validation errors when email is empty"
→ Plan: Navigate to login, clear email field, submit, check for error message.

### Auto Mode (Diff-Inference)

Infer what to verify from recent changes:

```bash
git diff --name-only HEAD~3..HEAD
git log --oneline -5
```

For each changed file, determine what user-facing behavior it affects:
- **Route/page changes** → verify those pages render correctly
- **Component changes** → verify the components appear and behave as expected
- **API changes** → verify the UI reflects the new data/behavior
- **Style changes** → verify visual appearance (recommend `--visual` if not already set)
- **Config changes** → verify the app starts and basic navigation works

Build a verification plan with 3-8 checks. Present the plan to the user:

> **Verification plan** (based on recent changes):
>
> 1. Navigate to `/` — verify page loads, main content visible
> 2. Navigate to `/dashboard` — verify data table renders
> 3. Click "Create" button — verify modal opens
> ...
>
> **Proceed with this plan? (yes / edit / add more)**

Wait for user confirmation. Adjust the plan based on their feedback.

## Step 5: Execute Verification

For each item in the verification plan, execute using Playwright MCP tools:

### Default Mode (Accessibility Snapshots)

For each verification step:

1. **Navigate**: `browser_navigate` to the target URL/route
2. **Snapshot**: `browser_snapshot` to get the accessibility tree
3. **Analyze**: Parse the accessibility tree for expected elements:
   - Check for specific text content, headings, buttons, links
   - Verify ARIA roles, labels, and states
   - Check form fields have proper labels
   - Verify interactive elements are keyboard-accessible
4. **Interact** (if needed): Use `browser_click`, `browser_fill_form`, `browser_press_key` to test interactions, then snapshot again
5. **Record result**: Pass/fail with details

### Visual Mode (`--visual`)

For each verification step:

1. **Navigate**: `browser_navigate` to the target URL/route
2. **Screenshot**: `browser_take_screenshot` to capture the current state
3. **Analyze**: Examine the screenshot for:
   - Layout correctness (elements positioned as expected)
   - Visual styling (colors, fonts, spacing)
   - Content rendering (text, images, icons visible)
   - Responsive behavior (if testing multiple viewports)
4. **Interact** (if needed): Use `browser_click`, `browser_fill_form` then screenshot again
5. **Save screenshots**: Write to `~/.agentic-workflow/$REPO_SLUG/verification/`
6. **Record result**: Pass/fail with details

### Screenshot Naming

```
verification/{timestamp}-{check-number}-{slug}.png
```

## Step 6: Report Results

Generate a structured report:

```
Verification Report
====================

App:     {app name from package.json}
URL:     {base URL}
Mode:    {explicit | auto (diff-inference)}
Method:  {accessibility snapshots | visual (screenshots)}
Date:    {ISO date}

Results: {N passed} / {M total} checks

  [PASS] 1. Homepage loads — main heading "Dashboard" found
  [PASS] 2. Navigation works — sidebar links present and clickable
  [FAIL] 3. Create modal — submit button not found after clicking "Create"
         Expected: Button with text "Submit" or role="button"
         Found: Modal opened but no submit button in accessibility tree
  [PASS] 4. Data table renders — table with 5 rows found

Issues Found:
  1. [FAIL] Create modal missing submit button
     Route: /dashboard
     Action: Click "Create" button
     Expected: Submit button appears in modal
     Actual: Modal opens but contains no submit action
     Suggestion: Check the modal component renders a submit button

{If --visual: Screenshots saved to ~/.agentic-workflow/<repo-slug>/verification/}
```

Write the report to:
```
~/.agentic-workflow/$REPO_SLUG/verification/{timestamp}-report.md
```

## Step 7: Release Browser Lock

Always release the lock, regardless of success or failure:

```bash
release_browser_lock
```

## Rules

- **Accessibility snapshots by default** — they are faster, more structured, and catch accessibility issues for free. Only use screenshots when `--visual` is specified.
- **Never modify code** — this skill is read-only verification. Report issues, don't fix them.
- **Always release the browser lock** — even if verification fails partway through. A leaked lock blocks all future verification sessions.
- **Respect the running app** — don't restart servers, modify databases, or change app state beyond normal UI interactions.
- **Keep verification focused** — 3-8 checks is the sweet spot. More than 10 suggests the scope is too broad; suggest splitting into multiple runs.
- **In auto mode, always confirm the plan** — don't execute without user approval, since diff-inference may miss or misinterpret changes.
