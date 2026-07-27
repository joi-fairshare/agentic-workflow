---
name: design-mockup-ios
description: Generate a per-screen SwiftUI mockup from design tokens, temporarily host it as the app entry point, build and screenshot on simulator via XcodeBuildMCP, then revert and register the baseline in screens.json for /design-verify-ios.
argument-hint: <screen-name>
allowed-tools: Bash(mkdir *), Bash(ls *), Bash(cp *), Bash(git *), Bash(SHARED_DIR=*), Bash(source *), Bash(LOCK_NAME=*), Read, Write, Edit, Glob, Grep, AskUserQuestion, mcp__xcodebuildmcp__session_show_defaults, mcp__xcodebuildmcp__discover_projs, mcp__xcodebuildmcp__list_schemes, mcp__xcodebuildmcp__list_sims, mcp__xcodebuildmcp__boot_sim, mcp__xcodebuildmcp__build_run_sim, mcp__xcodebuildmcp__build_sim, mcp__xcodebuildmcp__get_app_bundle_id, mcp__xcodebuildmcp__install_app_sim, mcp__xcodebuildmcp__launch_app_sim, mcp__xcodebuildmcp__stop_app_sim, mcp__xcodebuildmcp__screenshot, mcp__xcodebuildmcp__snapshot_ui, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff
---

<!-- === PREAMBLE START === -->

> **Agentic Workflow** — 44 native skills + 3 fetched external packs (impeccable, emil-design-eng, taste-skill family). Run any as `/<name>`.
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
> | `/withInterview` | Interview user to clarify requirements before executing |
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
> | `/autoplan` | Plan meta-orchestrator (productReview + archReview + planDesignReview + planDevexReview + cso in parallel) |
> | `/planDesignReview` | Design-lens review of plan docs |
> | `/planDevexReview` | DX-lens review of plan docs |
> | `/cso` | OWASP Top 10 + STRIDE threat model (plan or PR diff) |
> | `/design-shotgun` | Generate 4–6 mockup variants in parallel |
> | `/landAndDeploy` | Merge → deploy → smoke → chain canary |
> | `/canary` | Post-deploy monitoring with custom probes |
> | `/prismStatus` | Health check for prism-mcp |
> | `/specToProvenPR` | Approved spec → proven, review-clean PRs, one shippable stage at a time |
>
> **Output directory:** `~/.agentic-workflow/<repo-slug>/`
>
> ### Meta-Orchestration Convention
>
> Every native pipeline skill ends its response with a `## Next steps` block listing 1–3 recommended successor skills with one-line reasons. This is the meta-orchestration layer — skills hand off through structured suggestions, not by importing each other's logic. Three stage orchestrators (`/autoplan`, `/design-refine`, `/shipRelease`) fan out subagents in parallel and consolidate findings.

## Codebase Navigation

Prefer **Serena** for all code exploration — LSP-based symbol lookup is faster and more precise than file scanning.

| Task | Tool |
|------|------|
| Find a function, class, or symbol | `serena: find_symbol` |
| What references symbol X? | `serena: find_referencing_symbols` |
| Module/file structure overview | `serena: get_symbols_overview` |
| Search for a string or pattern | `Grep` (fallback) |
| Read a full file | `Read` (fallback) |

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
for s in review postReview addressReview enhancePrompt bootstrap rootCause bugHunt bugReport shipRelease syncDocs weeklyRetro officeHours productReview archReview withInterview design-analyze design-analyze-web design-analyze-ios design-language design-evolve design-evolve-web design-evolve-ios design-mockup design-mockup-web design-mockup-ios design-implement design-implement-web design-implement-ios design-refine design-verify design-verify-web design-verify-ios verify-app verify-web verify-ios autoplan planDesignReview planDevexReview cso design-shotgun landAndDeploy canary prismStatus specToProvenPR; do
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

## Session Context

Load prior work state for this repo from prism-mcp before starting.

**1. Derive a topic string** — synthesize 3–5 words from the skill argument and task intent:
- `/officeHours add dark mode` → `"dark mode UI feature"`
- `/rootCause TypeError cannot read properties` → `"TypeError cannot read properties"`
- `/review 42` → use the PR title once fetched: `"PR {title} review"`
- No argument → use the most specific descriptor available: `"{REPO_SLUG} {skill-name}"`

**2. Load context from prism-mcp:**
```
mcp__prism-mcp__session_load_context — project: REPO_SLUG, level: "standard",
  toolAction: "Loading session context", toolSummary: "<skill-name> context recovery"
```

Store the returned `expected_version` — you will need it at Session Close.

**3. Surface results:**
- If the response contains a non-empty summary or prior decisions:
  > **Prior context:** {summary}
  Use this to inform your approach before continuing.
- If prism-mcp returns an error, surface it and stop:
  > "prism-mcp unavailable: {error}. Ensure prism-mcp is running and registered."

## Session Close

> **Run at the end of every skill**, after all work is complete and the report has been shown to the user.

Save a structured ledger entry and update the live handoff state for this repo.

**1. Save ledger entry (immutable audit trail):**
```
mcp__prism-mcp__session_save_ledger — project: REPO_SLUG,
  conversation_id: "<skill-name>-<ISO-timestamp, e.g. 2026-04-08T14:32:00Z>",
  summary: "<one paragraph describing what was accomplished this session>",
  todos: ["<any open items left incomplete>", ...],
  files_changed: ["<paths of files created or modified>", ...],
  decisions: ["<key decisions made during this skill run>", ...]
```

**2. Update handoff state (mutable live state for next session):**
```
mcp__prism-mcp__session_save_handoff — project: REPO_SLUG,
  expected_version: <value returned by session_load_context>,
  open_todos: ["<open items not yet completed>", ...],
  active_branch: "<current git branch from: git branch --show-current>",
  last_summary: "<one sentence: what this skill just did>",
  key_context: "<critical facts the next session must know — constraints, decisions, blockers>"
```

If either call fails, surface the error:
> "prism-mcp session save failed: {error}. Context may not persist to next session."

<!-- === PREAMBLE END === -->

<!-- === DESIGN PREAMBLE START === -->

## Design Context — Load Design Language

### Block 1: Load design language

1. Read `.impeccable.md` if it exists:
   - Note the brand personality and aesthetic direction
   - Note the `## Sources` section: the URLs used to build the design tokens
2. Read `design-tokens.json` if it exists (W3C DTCG: colors, typography, spacing)
3. Read `planning/DESIGN_SYSTEM.md` if it exists (component catalog, design principles)

If none exist and this skill requires design context:
> "No design language found. Run `/design-language [url1 url2...]` to synthesize from
> reference materials, then retry."

### Block 2: Dynamic component inventory

Run the following scan and surface results as context before proceeding with the skill's own steps.

**Part A: Component library detection**

Read `package.json` (if it exists) and check `dependencies` + `devDependencies` for known libraries:

| Package pattern | Library |
|-----------------|---------|
| `@radix-ui/*` | Radix UI |
| `shadcn-ui`, `@shadcn/*` | shadcn/ui |
| `@headlessui/*` | Headless UI |
| `react-aria`, `@react-aria/*` | React Aria |
| `@mui/*` | Material UI |
| `@chakra-ui/*` | Chakra UI |
| `@mantine/*` | Mantine |
| `antd` | Ant Design |
| `@nextui-org/*` | NextUI |
| `daisyui` | daisyUI |

Cross-reference with the `## Sources` URLs from `.impeccable.md` — if a source URL matches a known component library's docs site (e.g., `ui.shadcn.com`, `radix-ui.com`, `mantine.dev`), note it as the detected library even if `package.json` doesn't yet include it.

For iOS: check Swift files for `import SwiftUI` (standard) or third-party component libs.

**Part B: Repo primitive scan**

```
Glob("src/components/**/*.{tsx,jsx,ts,js}")
Glob("components/**/*.{tsx,jsx,ts,js}")
Glob("app/components/**/*.{tsx,jsx,ts,js}")
Glob("ui/src/components/**/*.{tsx,jsx,ts,js}")
Glob("**/*.swift", limit to top 2 directory levels)
```

Collect file names (not contents), deduplicate, and derive component names from filenames
(e.g., `button.tsx` → `Button`, `card-header.tsx` → `CardHeader`).

Surface as a context note before proceeding:

```
Component context:
  Library:    shadcn/ui (detected from package.json + impeccable.md sources)
  Primitives: Button, Card, Input, Dialog, Badge, Separator (+7 more)

  Use these components in mockups and implementations before inventing new ones.
```

If no library and no primitives found: note "No component library or repo primitives detected — generate from scratch using design tokens."

### Block 3: Orchestration overview

```
Design pipeline:
  /design-language [urls]  →  synthesize tokens + brand personality
  /design-mockup <screen>  →  HTML (web) or SwiftUI (iOS) mockup
  /design-implement        →  production code from approved mockup
  /design-refine           →  Impeccable polish pass
  /design-verify           →  screenshot diff vs mockup baseline

  /design-evolve  can run anytime to merge new reference materials.
```

<!-- === DESIGN PREAMBLE END === -->

---

# Design Mockup iOS — SwiftUI Mockup Baseline Generator

Generates a per-screen SwiftUI mockup from design tokens, temporarily makes it the app's entry point, builds and screenshots it on the simulator, **reverts the swap**, and registers the baseline in `screens.json`.

Simulator sequence, capability probe, and lock recipe come from `_shared/sim-bootstrap.md`; artifact names and the `screens.json` schema from `_shared/design-artifact-paths.md`.

## Step 1: Validate Arguments & Prerequisites

The user must provide a screen name. If missing, stop:
> "Usage: `/design-mockup-ios <screen-name>`
> Example: `/design-mockup-ios settings`"

`design-tokens.json` must exist. If missing:
> "No design tokens found. Run `/design-analyze-ios` first to extract tokens from your Xcode assets."

The working tree for the entry-point file must be clean enough to verify the revert later — run `git status --short` now and record the output as the pre-run baseline.

## Step 2: Read Design Context

Read `design-tokens.json` and (if present) `.impeccable.md` — palette, typography scale, spacing system, brand personality.

## Step 3: Acquire Simulator Lock

Acquire the lock **before writing any files** (so a lock failure orphans nothing), in a single bash invocation per `_shared/sim-bootstrap.md` — shell state does not persist between Bash calls:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-mockup-ios/SKILL.md")")/../_shared"
LOCK_NAME=ios-sim source "$SHARED_DIR/skill-lock.sh"; acquire_lock
```

Every failure branch in later steps must re-source and release in that same invocation:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-mockup-ios/SKILL.md")")/../_shared"
LOCK_NAME=ios-sim source "$SHARED_DIR/skill-lock.sh"; release_lock
```

Use `return`, not `exit`, in sourced context — `skill-lock.sh` enables `set -euo pipefail` in the caller's shell.

## Step 4: Generate Mockup.swift

Write `Mockup.swift` into the main app target folder (temporary — for the build only):

```swift
// Mockup.swift — generated by /design-mockup-ios <screen-name>
// Temporary design mockup host — reverted after baseline capture.
import SwiftUI

// MARK: - Color(hex:) helper (defined here so the file is self-contained)
extension Color {
    init(hex: String) { /* standard hex → RGB parsing */ }
}

// MARK: - Design Tokens (inline for isolation)
private enum MockupTokens {
    enum Colors { /* one static let per color token from design-tokens.json */ }
    enum Spacing { /* one static let per spacing token */ }
    enum Typography { /* one static let per typography token */ }
}

// MARK: - Mockup View for <screen-name>
struct MockupView: View {
    var body: some View {
        // Representative <screen-name> screen using the design tokens.
        // Realistic placeholder content (not "Lorem ipsum").
        // iOS HIG: safe areas, standard navigation, system fonts as fallback.
    }
}

#Preview { MockupView() }
```

The mockup should use ALL color, spacing, and typography tokens to demonstrate the full design language (Step 9 reports the coverage %).

Persist a durable copy for `/design-implement-ios` — this copy is **kept, not deleted**:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-mockup-ios/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
mkdir -p "$AW_DIR/design"
cp "<path-to>/Mockup.swift" "$AW_DIR/design/Mockup-<screen-name>.swift"
```

## Step 5: Entry-Point Swap

A `#Preview` block never renders in the built app — to earn "app running with mockup visible", temporarily make `MockupView` the entry point:

1. `Grep("@main", glob: "**/*.swift")` in the app target. Record and echo the original entry point: `original @main: <File.swift>:<StructName>`.
2. Edit that file: `@main` → `// @main // temporarily disabled by /design-mockup-ios — MUST be reverted`.
3. Append a temporary host to `Mockup.swift`:
   ```swift
   @main
   struct MockupHostApp: App {
       var body: some Scene { WindowGroup { MockupView() } }
   }
   ```

## Step 6: Build, Launch, Screenshot

Follow the canonical sequence from `_shared/sim-bootstrap.md` (`mcp__xcodebuildmcp__session_show_defaults` → discover/schemes if missing → `mcp__xcodebuildmcp__list_sims`/`mcp__xcodebuildmcp__boot_sim` → `mcp__xcodebuildmcp__build_run_sim` or the split build/install/launch path). With the mockup visible: `mcp__xcodebuildmcp__screenshot`.

If the build fails: report the error, then go **directly to Step 7 (revert) and Step 10 (release lock)** — never write a baseline from a broken build.

Baseline path (overwrite requires an `AskUserQuestion` "Baseline exists for `<screen-name>`. Overwrite? (yes/no)" first):

```
~/.agentic-workflow/<repo-slug>/design/mockup-ios-<screen-name>.png
```

Optionally capture a dark-mode variant as `mockup-ios-<screen-name>-dark.png`.

## Step 7: Revert Entry-Point Swap (MANDATORY)

This step runs on **every** path — success, build failure, or capture failure:

1. Edit the original entry-point file: restore `@main` (remove the comment marker).
2. Delete the temporary `Mockup.swift` from the app target (the persisted `$AW_DIR/design/Mockup-<screen-name>.swift` copy stays).
3. **Verify with git:** run `git status --short` and `git diff -- <original-entry-point-file>` — output must match the Step 1 pre-run baseline, and the diff must be empty. If any residue remains, fix it before reporting. Echo: `revert verified: git diff clean`.

## Step 8: Approval & screens.json

Read the captured baseline PNG and present it. `AskUserQuestion`: **Approve** / **Revise** (Revise = adjust `MockupView`, re-run Steps 5–7; cap 5 rounds — on exceed, stop and report unapproved with no `screens.json` entry). On Approve, record the UTC timestamp as `approved_at`.

Determine the **nav recipe** — how `/design-verify-ios` reaches this screen in the real app: infer from the app's navigation or `AskUserQuestion` (e.g., "Settings tab → Profile row"). Express as `[{"action":"tap","target":"<label or x,y from mcp__xcodebuildmcp__snapshot_ui>"}]`, or `null` for the launch screen.

Read → mutate → Write `~/.agentic-workflow/<repo-slug>/design/screens.json` (never clobber other screens), per the CD4 schema in `_shared/design-artifact-paths.md`:

```json
{ "schema": "screens/v1",
  "viewports": {"mobile":"375x812","tablet":"768x1024","desktop":"1440x900"},
  "screens": { "<screen-name>": {
      "route": null,
      "nav": [ {"action":"tap","target":"<label or x,y>"} ],
      "baselines": { "ios": "mockup-ios-<screen-name>.png" },
      "approved_at": "<ISO timestamp>",
      "baseline_stale": null,
      "source": "design-mockup-ios" } } }
```

Add `"ios-dark": "mockup-ios-<screen-name>-dark.png"` to `baselines` if captured.

## Step 9: Token Coverage

Count distinct tokens in `design-tokens.json` (colors + spacing + typography) and Grep `$AW_DIR/design/Mockup-<screen-name>.swift` for how many are actually referenced. Report:

```
token coverage: <used>/<total> (<pct>%)
```

If below 100%, list the unused tokens so the next revision can incorporate them.

## Step 10: Release Simulator Lock

Final step, success or failure — single invocation:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-mockup-ios/SKILL.md")")/../_shared"
LOCK_NAME=ios-sim source "$SHARED_DIR/skill-lock.sh"; release_lock
```

## Step 11: Report

```
iOS Mockup Baseline Created
============================

Screen:         <screen-name>
Mockup source:  ~/.agentic-workflow/<repo-slug>/design/Mockup-<screen-name>.swift (persisted)
Baseline:       ~/.agentic-workflow/<repo-slug>/design/mockup-ios-<screen-name>.png
screens.json:   entry written (nav: <recipe|null>, approved_at: <ISO>)
Token coverage: <used>/<total> (<pct>%)
Entry point:    swap reverted, git diff clean
```

## Rules

- The mockup is a design artifact, not production code — optimize for visual completeness, not code quality
- Inline all design tokens and the `Color(hex:)` extension so the file is self-contained
- Never write a baseline from a broken build
- The entry-point revert (Step 7) is mandatory on every path and must be verified with `git diff` before reporting
- Keep `design/Mockup-<screen-name>.swift` — `/design-implement-ios` reads it as the primary reference; only the temporary in-target `Mockup.swift` is deleted
- Lock ordering: acquire before any file is written; release as the final step, success or failure

## Next steps

- `/design-implement-ios` — generate production Theme.swift and SwiftUI components from the persisted mockup
- `/design-verify-ios <screen-name>` — compare the implementation against this baseline
- `/design-refine` — iterate the SwiftUI mockup before implementation
