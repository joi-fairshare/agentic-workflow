---
name: bugReport
description: Report-only variant of bugHunt — produces a structured bug report with health scores but does NOT fix the bugs. Use for triage and prioritization.
argument-hint: "[--runtime] [--depth N] [area-or-module-to-audit]"
allowed-tools: Bash(git *), Bash(npm *), Bash(npx *), Bash(pytest *), Bash(cargo *), Bash(go *), Bash(bundle *), Bash(coverage *), Bash(SHARED_DIR=*), Bash(source *), Bash(cat *), Agent, Read, Glob, Grep, Write, Skill, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff
---

# Bug Report

Read-only audit that produces a structured bug report with health scores. This skill **never modifies source code** — it is purely diagnostic.

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

**IMPORTANT: This skill is read-only. Do NOT modify any source code, test files, or configuration. Only write the output report.**

> **Read-only exception:** running the detected test suite (`$TEST_CMD`) may itself write build artifacts, coverage output, or test snapshots as side effects. That is tolerated — but never edit source, tests, or config yourself.

## Step 1: Parse Scope

Parse the argument:

- **Area/module** — scope the audit to that directory, package, or module. No argument ⇒ audit the entire project.
- **`--runtime`** — additionally verify behavior in the running app (Step 3.5). Without it, behavior claims stay static-only.
- **`--depth N`** — dispatch-chain depth guard (default 0). At N ≥ 2, do not suggest or dispatch further skills — report only.

## Step 2: Scan

Detect the project's toolchain per `skills/_shared/test-runner-detection.md` (sets `TEST_CMD` / `COVERAGE_CMD`), then run each **detected** tool and collect output. Do not stop on failure — collect everything.

- **Tests:** run `$TEST_CMD` (scoped where supported, e.g. `npm test -- <path>`, `pytest <path>`). No runner detected ⇒ record test dimension as **"n/a — excluded from scoring"**.
- **Typecheck:** the stack's checker if configured (JS: `npm run typecheck` / `npx tsc --noEmit`; mypy/`cargo check`/`go vet` equivalents). Not configured ⇒ **"n/a — excluded from scoring"**.
- **Lint:** the stack's linter if configured (JS: `npm run lint` / `npx eslint <path>`; ruff/clippy/golangci-lint equivalents). Not configured ⇒ **"n/a — excluded from scoring"**.

**Never score a missing toolchain as a failure** — a healthy non-JS repo must not score catastrophically because npm commands don't apply (see the scoring rule in the shared file).

Capture and store:
- **Test output:** pass count, fail count, skip count, coverage percentage (if reported)
- **Typecheck output:** error count, list of errors with file and line
- **Lint output:** error count, warning count, list of issues with file and line

## Step 3: Investigate

For each failure, warning, or error found in Step 2:

1. **Read the relevant source file** at the reported line using Read.
2. **Understand the context** — what is the code doing, why is it failing?
3. **Classify** each item as one of:

| Classification | Meaning |
|---------------|---------|
| `bug` | Actual defect that causes incorrect behavior |
| `tech-debt` | Code smell, complexity issue, or pattern violation — not currently broken |
| `test-gap` | Missing test coverage for an important code path |
| `false-positive` | Tool is wrong — the code is correct |

Rate each `bug` with the shared severity scale from `skills/_shared/severity.md`: **CRITICAL / HIGH / MEDIUM / LOW** (same vocabulary as `/review` and `/cso`).

Static tool output alone cannot confirm runtime behavior — without `--runtime`, mark suspected behavior defects as `bug (suspected — static evidence only)`.

## Step 3.5: Runtime Verification (only with `--runtime`)

Observe actual behavior instead of inferring it from static output:

> `Skill(skill="verify-app", args="--yes")`

Fold the resulting evidence pack (`skills/_shared/evidence-pack.md`) into the audit: each FAIL check/journey becomes a Bugs-table row with source `runtime`, and the pack path is cited in the report. Skip this step entirely without the flag.

## Step 4: Score

Compute health scores on a 0-100 scale — **for detected dimensions only**.

**Unknown-dimension rule:** a dimension whose toolchain is not configured ("n/a" from Step 2) reports `—` in the dashboard — never a substitute number like 50 — and its weight is redistributed proportionally across the detected dimensions. Example: no typecheck configured ⇒ weights renormalize to test 40/70 ≈ 57%, lint 30/70 ≈ 43%.

### Test Health (base weight: 40%)
```
score = (pass_count / total_count) * 100
```
If coverage data is available, blend it: `score = (pass_rate * 0.6) + (coverage_pct * 0.4)`.
Runner detected but zero tests exist ⇒ score = 0. No runner detected ⇒ `—` (n/a, excluded).

### Type Health (base weight: 30%)
```
score = max(0, 100 - (error_count * 5))
```
Each typecheck error deducts 5 points. Floor at 0. Not configured ⇒ `—` (n/a, excluded).

### Lint Health (base weight: 30%)
```
score = max(0, 100 - (error_count * 3) - (warning_count * 1))
```
Each error deducts 3 points, each warning deducts 1. Floor at 0. Not configured ⇒ `—` (n/a, excluded).

### Overall Health
```
overall = Σ(score_i × weight_i) / Σ(weight_i)   over detected dimensions only
```
If no dimension is detectable, overall is `—` with the note "no toolchain detected — nothing to score".

## Step 5: Write Report

Write the report to `$HOME/.agentic-workflow/$REPO_SLUG/qa/{timestamp}-audit-{slug}.md` where:
- `{timestamp}` is `YYYYMMDD-HHmmss` format
- `{slug}` is the scoped module name in kebab-case, or `full-project` if no scope

Report format:

```markdown
# Bug Report: {scope or "Full Project Audit"}

**Date:** {ISO timestamp}
**Scope:** {module path or "entire project"}

## Health Score Dashboard

| Metric | Score | Weight | Details |
|--------|-------|--------|---------|
| Test Health | {score}/100 or — | {renormalized %} | {pass}/{total} tests passing, {coverage}% coverage — or "n/a — excluded from scoring" |
| Type Health | {score}/100 or — | {renormalized %} | {n} typecheck errors — or "n/a — excluded from scoring" |
| Lint Health | {score}/100 or — | {renormalized %} | {n} errors, {n} warnings — or "n/a — excluded from scoring" |
| **Overall** | **{score}/100 or —** | | weights renormalized over detected dimensions |

## Bugs

| # | Severity | Source | File | Line | Description |
|---|----------|--------|------|------|-------------|
| 1 | {CRITICAL/HIGH/MEDIUM/LOW} | {static \| runtime \| suspected} | `{file}` | {line} | {description} |

{If no bugs found: "No bugs detected."}
{If --runtime ran: "Runtime evidence pack: {path to verification/<run-id>/pack.json} — verdict {PASS|WARN|FAIL}"}

## Tech Debt

| # | File | Line | Description |
|---|------|------|-------------|
| 1 | `{file}` | {line} | {description} |

{If none: "No tech debt items identified."}

## Test Gaps

| # | Area | Description |
|---|------|-------------|
| 1 | `{file or module}` | {what is untested} |

{If none: "Test coverage appears adequate for the scoped area."}

## False Positives

Every suppressed item is listed — suppression is never invisible:

| # | Tool | File | Line | Reported issue | Justification for suppression |
|---|------|------|------|----------------|-------------------------------|
| 1 | {tool} | `{file}` | {line} | {what the tool claimed} | {why the code is actually correct} |

{If none: "No false positives."}

## Recommended Fix Priority

Based on severity and impact, address issues in this order:

1. {highest priority item — why}
2. {next item — why}
3. {next item — why}
...
```

## Step 6: Report to User

```
Bug report complete.

Scope: {module or "full project"}
Overall health: {score}/100 (— dimensions excluded from scoring)
  Test:  {score}/100 or —
  Type:  {score}/100 or —
  Lint:  {score}/100 or —

Found: {n} bugs, {n} tech debt items, {n} test gaps, {n} false positives (itemized in report)
Report: ~/.agentic-workflow/<repo-slug>/qa/{filename}

Fix a specific bug with full context: /bugHunt --from-report <report-path> --item N
```

## Next steps

- `/bugHunt --from-report <report-path> --item N` — auto-fix a numbered bug from this report with verification
- `/rootCause` — deep-dive a specific bug from the report
