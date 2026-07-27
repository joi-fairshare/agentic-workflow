---
name: autoplan
description: "Plan meta-orchestrator. Runs productReview + archReview + planDesignReview + planDevexReview + cso(plan) in parallel via subagents and consolidates findings with cross-lens tension surfacing."
argument-hint: "[plan-path] [--mode mvp|growth|scale|pivot] [--slim]"
allowed-tools: Bash(ls *), Bash(SHARED_DIR=*), Agent, Read, Write, Glob, Grep, Skill, AskUserQuestion, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff
---

# Autoplan — Plan Meta-Orchestrator

Fans out five review lenses in parallel against a plan document, then consolidates findings into a single decision-ready report.

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

## Overview

Dispatches five subagents in parallel — product, architecture, design, devex, security — each writing its own review file directly into the feature dir. After all return, consolidates: dedupes findings into one normalized severity table, surfaces cross-lens tensions (e.g., "product wants X but security blocks Y"), derives an overall verdict, recommends top 3 next actions. One command for full plan vetting.

## Inputs

- Plan doc path (arg), OR auto-discover per `_shared/plan-discovery.md`:
  ```bash
  SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/autoplan/SKILL.md")")/../_shared"
  source "$SHARED_DIR/repo-slug.sh"
  PLAN_DIR=$(ls -1dt "$AW_DIR/plans/"*/ 2>/dev/null | head -1)
  ```
  Resolve files inside the plan dir per `_shared/plan-layout.md`. If nothing is found, stop and ask the user for the plan path.
- `--mode mvp|growth|scale|pivot` (optional) — forwarded verbatim to `productReview` (its default is `mvp`, which under-reviews growth/scale-stage plans).
- `--slim` (optional) — forwarded verbatim to every lens: write compact reviews (tables and verdict only, minimal prose).

## Steps

1. Resolve the plan doc path via the Inputs block above. Derive `<feature>` as the parent dir name of the plan.md. Compute the absolute feature dir path: `$AW_DIR/plans/<feature>/`.

2. **Dispatch 5 subagents in parallel** per `_shared/parallel-dispatch.md`: send ONE message containing five `Agent` tool calls. Every agent receives the absolute plan.md path and an explicit `--output` path inside the feature dir — no agent invents its own output location, and nothing needs moving afterward. Append `--slim` to every invocation when given.

   - **`productReview` agent** → "Invoke the `productReview` skill with `--plan <plan-path> --output <feature-dir>/product-review.md`" — append `--mode <mode>` when `--mode` was given.
   - **`archReview` agent** → "Invoke the `archReview` skill with `--plan <plan-path> --output <feature-dir>/arch-review.md`."
   - **`planDesignReview` agent** → "Invoke the `planDesignReview` skill with `--plan <plan-path> --output <feature-dir>/design-review.md`."
   - **`planDevexReview` agent** → "Invoke the `planDevexReview` skill with `--plan <plan-path> --output <feature-dir>/devex-review.md`."
   - **`cso --plan` agent** → "Invoke the `cso` skill with `--plan <plan-path> --output <feature-dir>/security-review.md`."

3. **Existence-check before consolidation** (per `_shared/parallel-dispatch.md`). After all 5 agents return, verify each expected output exists and is non-empty:

   ```bash
   SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/autoplan/SKILL.md")")/../_shared"
   source "$SHARED_DIR/repo-slug.sh"
   FEATURE_DIR="$AW_DIR/plans/<feature>"
   for f in product-review arch-review design-review devex-review security-review; do
     [ -s "$FEATURE_DIR/$f.md" ] && echo "OK: $f.md" || echo "MISSING OUTPUT: $f.md"
   done
   ```

   A missing or empty output is a **named failure**: record it in the Lens status table and in the summary. Never fill in findings from memory for a lens whose file is missing.

4. Read every present review file. Fill the Lens status table from the Step 3 check output plus each file's own `verdict:` line — never from memory.

5. **Consolidate:** produce `plans/<feature>/consolidated-review.md`:
   ```markdown
   # Consolidated Plan Review — <feature>
   
   **Plan:** <relative path>
   **Reviewed:** <ISO date>
   **Lenses applied:** product · arch · design · devex · security
   
   ## Normalized findings
   <Schema per `_shared/severity.md`. Map each lens's vocabulary via its legacy table
   (P0→CRITICAL, P1→HIGH, etc.). Dedupe overlapping findings across lenses: keep one
   row, list every raising lens in the lens column. Empty ⇒ literal `None.`>
   | id | severity | lens | location | finding | recommended fix |
   |---|---|---|---|---|---|
   
   ## Top tensions (cross-lens)
   <Numbered list. Each item: short title, the lenses in tension, the two finding ids
   in tension, the trade-off, recommended resolution.
   Floor: at least 1 tension for every pair of lenses that both produced HIGH-or-worse
   findings. If a HIGH-producing pair genuinely has no tension, state it explicitly:
   "No tension between <lens A> and <lens B>: <reason>." An empty section without
   these statements is invalid.>
   
   ## Per-lens highlights
   ### Product
   - Top wins: <bullets>
   - Top gaps: <bullets>
   - File: `plans/<feature>/product-review.md`
   ### Architecture / Design / Devex / Security
   <same shape each>
   
   ## Recommended next actions
   1. <action> — <why> — <which lens raised it>
   2. <action> — <why> — <which lens raised it>
   3. <action> — <why> — <which lens raised it>
   
   ## Lens status
   | Lens | File | Status |
   |---|---|---|
   | Product | product-review.md | ✓ / partial / MISSING — from Step 3 output |
   | Architecture | arch-review.md | … |
   | Design | design-review.md | … |
   | Devex | devex-review.md | … |
   | Security | security-review.md | … |
   
   ## Overall verdict
   <Rule-derived per `_shared/severity.md` (CD9) from the Normalized findings table —
   never judgment-called: any CRITICAL ⇒ BLOCKED; any HIGH ⇒ NEEDS_WORK; only
   MEDIUM/LOW or lenses skipped-with-reason ⇒ PASS. A MISSING lens caps the verdict
   at NEEDS_WORK. One sentence citing the driving finding ids, then end the file with
   the literal final line:>
   verdict: <PASS|NEEDS_WORK|BLOCKED>
   ```

6. Print a short summary to stdout (5-line lens status table + overall verdict + top 3 next actions) so the user sees the result without opening the file.

## Outputs

All under `~/.agentic-workflow/<repo-slug>/plans/<feature>/`: `product-review.md` · `arch-review.md` · `design-review.md` · `devex-review.md` · `security-review.md` · `consolidated-review.md`

## Next steps

- If the overall verdict is **not BLOCKED** — `/specToProvenPR <feature-dir>/plan.md` — hand the vetted plan to staged implementation; the consolidated review and lens files ride along in the feature dir
- If **BLOCKED** — address the CRITICAL findings (edit the plan or re-run `/officeHours`), then re-run `/autoplan`
- `/design-shotgun` — if visual exploration is recommended by the design lens
