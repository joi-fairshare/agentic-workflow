---
name: specToProvenPR
description: Use when turning an approved spec or design doc into production-ready pull requests that are definitively proven to work in the running app. Use for staged multi-phase builds where each stage must be planned, implemented, proven in the app, and driven to zero review findings before a PR opens. Triggers include "take this spec to PRs", "ship this design", "prove it works then open the PR", staged epic delivery, and review-loop-until-clean. Also use when tempted to stop a review loop early, treat green tests as proof, or defer findings to a follow-up.
argument-hint: "[approved-spec-or-design-doc-path] (no argument = resume from stages.md)"
allowed-tools: Bash(git *), Bash(gh *), Bash(npm *), Bash(npx *), Bash(SHARED_DIR=*), Bash(source *), Bash(mkdir *), Bash(ls *), Bash(cat *), Bash(test *), Bash(date *), Agent, Read, Write, Edit, Glob, Grep, Skill, TodoWrite, AskUserQuestion, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff
---

# specToProvenPR

Take an approved spec to production-ready PRs that are **definitively proven to work in the running app**, one shippable stage at a time.

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

## Core principle

A stage is **DONE** only when all three gates are green at once:

1. **PROOF**: the spec's behavior was observed in the running app (not merely unit-tested), with an evidence pack captured per `_shared/evidence-pack.md` (`pack.json` verdict not FAIL) and an independent cross-check for every claim.
2. **REVIEW=0**: the most recent `/review` run returned **zero findings at every severity** (not "only lows left", not "I fixed them, re-review is unnecessary").
3. **GREEN**: the full test suite and CI pass.

Then mark the PR ready and **STOP for human merge**. "Practically done", "just nits", "trivial delta" all mean: not done.

## When to use

- An **approved** spec (e.g. `planning/specs/<topic>/DESIGN.md`) that must ship as staged, proven, review-clean PRs — one stage per PR. Not approved → stop and approve it first.
- **NOT for**: a one-line fix with no observable app behavior, or pure docs. Use a normal commit.
- **Resume mode**: invoked with no argument, read `plans/<epic>/stages.md`, print a state synopsis (per-stage status, current step, open PR, last verdict), and continue from the first incomplete step.

## Stage steps

Create one TodoWrite item per stage from stages.md. Shared files and output dirs resolve via this block — re-source it at the top of every bash block (shell state does not persist between Bash calls):

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/specToProvenPR/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
STAGE_DIR="$AW_DIR/proof/<stage-slug>" && mkdir -p "$STAGE_DIR"
```

**0. Isolate (once per epic).** Create a dedicated worktree (**REQUIRED:** superpowers:using-git-worktrees). All stage work happens there.

**0.5. Stage map + contracts (once per epic).** Decompose the spec into staged, independently shippable PR-sized units (match the spec's phases; one stage = one PR) and write `plans/<epic>/stages.md`: per stage — goal, observable signal, files touched, estimated size, status. Then record two contracts in stages.md:
- **Autonomy contract** — one AskUserQuestion, asked once up front: pause for approval after each stage, or run continuously to epic end?
- **Git topology contract** — detect the base branch (`gh repo view --json defaultBranchRef -q .defaultBranchRef.name`) and the push remote (fork vs origin) up front and state them. **Never push the base branch**; each stage gets its own branch off base.

**1. Plan the stage.** Expand this stage's stages.md entry into an implementation plan. **REQUIRED:** superpowers:writing-plans, scoped to this stage only.

**2. Verification plan — written BEFORE you implement.** Write `$STAGE_DIR/verification-plan.md` from `_shared/verification-plan-template.md`: app entry, ≥1 journey (≥3 interactive steps), **≥3 named lenses** from `_shared/verification-lenses.md`, and ≥1 independent cross-check per numeric/behavioral claim. **GATE:** the plan's `created` timestamp must predate the stage's first implementation commit (`git log --diff-filter=A --format=%cI -- <files> | tail -1`); a plan written after code is invalid — regenerate the stage. If you cannot state the observable signal, the stage is underspecified: fix that first.

**3. Implement.** **REQUIRED:** superpowers:test-driven-development, executed via superpowers:subagent-driven-development or superpowers:executing-plans. Start the app with the project's own run recipe (`/run` or the documented dev command) — never assume a Node app.

**4. Prove in the running app.** Green unit tests are NOT proof — they confirm your code matches your assumptions, not reality.
- Invoke exactly: `Skill(skill="verify-app", args="--yes --journey <path-to-verification-plan.md> --lenses functional,error-state,accessibility[,visual,responsive]")`. A single-screenshot pass is forbidden — the journey must execute.
- **Baseline check:** if `$AW_DIR/design/screens.json` baselines cover any of this stage's screens, `/design-verify` is **mandatory**; a FAIL diff (>10%) is stage-blocking.
- **Evidence pack (per `_shared/evidence-pack.md`):** verify-* writes `verification/<run-id>/pack.json` + report. Write `$STAGE_DIR/evidence.md` — verdict line, journey table, mockup diff %, each cross-check as its recorded command **with raw output side-by-side** — plus a pointer to the `<run-id>` dir.
- `pack.json` verdict FAIL, or proof not observed → fix and return to step 3. **REQUIRED:** superpowers:verification-before-completion.

**5. Open a draft PR.** Push the stage branch to the recorded remote, then `gh pr create --draft` with the body per `_shared/pr-body.md` (`## Evidence` embeds the evidence.md text; `--attach-images` defaults on for user-facing stages). The review loop needs an open PR — draft first, ready last.

**6. Review loop to zero (cap 5).** `/review` → `/postReview` → `/addressReview --all` → re-run `/review`. Repeat while any finding at any severity remains. Always pass `--all`: the default severity filter drops suggestions/nits and the loop would never terminate. After 5 iterations without zero: stop, report the oscillating findings verbatim, ask the user.

**7. Gates → ready → STOP.** Confirm all of: tests + CI green; latest `/review` = zero findings; `test -s "$STAGE_DIR/evidence.md"`; pack verdict not FAIL. Then `gh pr ready` and **STOP for human merge approval — never self-merge**. Emit the next-stage synopsis from stages.md, update stage status, and save the session handoff; after the human merges, start the next stage at step 1 (honoring the autonomy contract).

## The review loop to zero

Zero is a hard gate, not a target. The only way to *know* you are at zero is that **`/review` itself reported zero on its most recent run** after your fixes. Self-certifying ("I fixed the three it found, so it must be clean") does not count: fixes can introduce new findings, and reviewers see the delta you cannot.

- After every `/addressReview --all`, you **must** re-run `/review`. No exceptions for "trivial" deltas.
- Every finding is **fixed**, not deferred. A finding you believe is wrong is still resolved explicitly: reply on the thread with the technical reason, mark it resolved in `~/.agentic-workflow/<repo-slug>/reviews/<pr>.json`, then re-run `/review`.
- The loop ends ONLY when a `/review` run returns zero findings at every severity — or the cap of 5 triggers report-and-ask.

### Rationalizations and red flags (all FALSE — each means: return to the loop)

| Excuse / red flag | Reality |
|-------------------|---------|
| "Re-running review on a trivial delta is theater" / about to skip the re-run | The delta can add findings; only a clean `/review` run proves zero. Re-run. |
| "Only LOWs/nits are left" / "file them as follow-ups" | Zero means zero; deferral is not resolution. Fix them on THIS PR. |
| "Tests are green, so it works" / "done" on unit-test evidence alone | Tests confirm assumptions, not reality. Prove it in the app and capture the pack. |
| "I made a deliberate call to stop" / "it's late, the user is waiting" | The stop condition is `/review` returning zero (or the cap-5 ask), not your judgment or the clock. |
| "The reviewer is wrong, so I can ignore it" | Resolve in writing on the thread + state file, then re-run. Never silently ignore. |
| Writing the verification plan after implementing / marking ready with FAIL or missing evidence | The plan predates code (step 2 gate); non-FAIL evidence is a ready gate (step 7). |

## Composition (per stage)

| Stage | Use |
|-------|-----|
| Isolate / Plan / Implement | superpowers:using-git-worktrees · writing-plans · test-driven-development |
| Prove | verify-app (+ design-verify when screens.json baselines match) + superpowers:verification-before-completion |
| Review loop | `/review` → `/postReview` → `/addressReview --all`, looped to zero |
| Ship | draft PR → gates → `gh pr ready`; or `/shipRelease --no-deploy` for an already-proven, review-clean stage |

## Common mistakes

- **Bundling phases into one PR.** Each stage is its own proven, review-clean PR.
- **Opening the PR ready, or after the review loop.** `/review` needs an open PR: draft at step 5, ready only at step 7.
- **Self-merging.** The harness stops at the human merge gate.

## Next steps

- `/landAndDeploy` — after a human approves and merges the stage PR, poll for merge then deploy and smoke it (never self-merge; this skill stops at the human gate)
- `/shipRelease` — the single-command gate+PR path for a stage that is already proven and review-clean
- `/weeklyRetro` — once all stages of the epic have shipped, capture what shipped and what slipped
