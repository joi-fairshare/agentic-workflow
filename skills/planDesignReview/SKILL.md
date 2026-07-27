---
name: planDesignReview
description: "Design-lens review of a plan document. Rates information architecture, interaction states, user flows, accessibility, and brand/voice consistency on a 1–5 scale with specific gaps."
argument-hint: "[plan-path] [--output <path>] [--slim]"
allowed-tools: Bash(git *), Bash(ls *), Bash(mkdir *), Bash(SHARED_DIR=*), Agent, Read, Write, Glob, Grep, Skill, AskUserQuestion, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff
---

# Plan Design Review — Design Lens on Plan Docs

Rates a plan document across five design dimensions with specific gaps and recommended changes. Complements `/productReview` and `/archReview`.

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

Reads a plan directory's design-relevant docs (auto-discovers latest if no arg) along with the design language artifacts (`.impeccable.md`, `design-tokens.json`). Rates each of five dimensions on the anchored 1–5 scale from `_shared/severity.md`, with a mandatory surface×state coverage table. Writes the review to `plans/<feature>/design-review.md` so `/autoplan` can consolidate alongside other lenses.

## Inputs

- Plan — path arg, OR auto-discover per `_shared/plan-discovery.md`:
  ```bash
  SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/planDesignReview/SKILL.md")")/../_shared"
  source "$SHARED_DIR/repo-slug.sh"
  PLAN_DIR=$(ls -1dt "$AW_DIR/plans/"*/ 2>/dev/null | head -1)
  ```
  (falls back to the newest legacy single-file plan — see the shared snippet)
- From the plan dir, per the `_shared/plan-layout.md` reader matrix: `plan.md` + **`design-brief.md`** (the doc written for the design team — the primary source for this lens) + `product.md` (legacy alias `requirements.md` only if product.md is absent)
- `--output <path>` (optional) — explicit output file path. `/autoplan` passes `--output <feature-dir>/design-review.md`.
- `--slim` (optional) — compact output: Inputs available, Ratings, coverage tables, and verdict only
- `.impeccable.md` from project root (if missing: Brand/voice dimension is N/A)
- `design-tokens.json` from project root (if missing: note in report)

## Steps

1. Resolve the plan path via the Inputs block. Resolve the output path: `--output` verbatim if provided; otherwise `$AW_DIR/plans/<feature>/design-review.md` (where `<feature>` is the parent dir name of the resolved plan.md).
2. Read `plan.md`, `design-brief.md`, `product.md`, `.impeccable.md` (if present), `design-tokens.json` (if present). Record presence/absence of each in the `## Inputs available` table — **an absent input makes its dependent dimension `N/A — missing <input>`, never a number.**
3. Review across five dimensions, each rated on the anchored 1–5 scale in `_shared/severity.md` (5 = no findings above LOW … 1 = CRITICAL or unaddressed):
   - **Information architecture** — top-level structure, grouping, naming, prioritization
   - **Interaction states** — loading / error / empty / success — verified via the surface×state table below, not free-form prose
   - **User flow completeness** — entry points, success paths, failure paths, edge cases
   - **Accessibility** — keyboard nav, screen reader semantics, color contrast, focus management — verified via the a11y sub-table
   - **Brand/voice consistency** — alignment with `.impeccable.md` brand personality; voice/tone of user-facing copy (requires `.impeccable.md` — else N/A)
4. For each scored dimension, write 2–4 bullet evidence lines (quote plan lines + cite line numbers) + a 1–3 bullet "Recommended changes" list.
5. Derive the verdict — rule-based per `_shared/severity.md`: any dimension ≤2 or any CRITICAL finding ⇒ BLOCKED; any dimension = 3 or any HIGH finding ⇒ NEEDS_WORK; otherwise PASS. N/A dimensions don't score but are listed.
6. Write to the resolved output path. Ensure the parent dir exists with `mkdir -p`. Structure:
   ```markdown
   # Plan Design Review — <feature>
   
   **Plan:** <relative path>
   **Reviewed:** <ISO date>
   
   ## Inputs available
   | Input | Present? |
   |---|---|
   | plan.md | ✓/✗ |
   | design-brief.md | ✓/✗ |
   | product.md | ✓/✗ |
   | .impeccable.md | ✓/✗ |
   | design-tokens.json | ✓/✗ |
   <Absent input ⇒ dependent dimension is N/A — not scored.>
   
   ## Summary
   <3–5 sentences. Top tensions, top wins.>
   
   ## Ratings
   <Anchors per `_shared/severity.md`.>
   | Dimension | Rating | Top gap |
   |---|---|---|
   | Information architecture | N/5 | … |
   | Interaction states | N/5 | … |
   | User flow completeness | N/5 | … |
   | Accessibility | N/5 | … |
   | Brand/voice consistency | N/5 or N/A — missing .impeccable.md | … |
   
   ## Surface × state coverage
   <One row per interactive surface named in the plan/design-brief. Each cell cites
   the plan line addressing that state, or the literal `GAP`. GAPs feed the
   Interaction-states rating.>
   | Surface | Loading | Error | Empty | Success |
   |---|---|---|---|---|
   
   ### Accessibility sub-table
   | Surface | Keyboard | Screen reader | Contrast | Focus mgmt |
   |---|---|---|---|---|
   
   ## Detailed findings
   ### Information architecture (N/5)
   - Evidence: …
   - Recommended changes: …
   <etc. for each dimension>
   
   ## Verdict
   <One sentence citing the driving dimension/finding, then the literal final line:>
   verdict: <PASS|NEEDS_WORK|BLOCKED>
   ```

## Outputs

- Default: `~/.agentic-workflow/<repo-slug>/plans/<feature>/design-review.md`
- When `--output <path>` is supplied: that exact path (used by `/autoplan` for canonical placement inside the feature dir)

## Next steps

- `/autoplan` — if running standalone, fan out to other plan lenses (product, arch, devex, security)
- `/design-shotgun` — if design ratings are low, regenerate visuals from variants instead of patching the plan
