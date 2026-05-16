---
name: cso
description: "OWASP Top 10 + STRIDE threat model. Runs on a plan (pre-impl mode) or a PR diff (post-impl mode). Outputs severity-rated findings with mitigations."
argument-hint: "[--plan|--diff] [path-or-pr#] [--output <path>]"
allowed-tools: Bash(gh *), Bash(git *), Agent, Read, Write, Glob, Grep, Skill
---

# CSO — Security Threat Modeling

OWASP Top 10 + STRIDE threat model. Pre-impl (plan) or post-impl (diff) mode. Auto-detects mode from invocation context.

<!-- === PREAMBLE START === -->

> **Agentic Workflow** — 43 native skills + 3 fetched external packs (impeccable, emil-design-eng, taste-skill family). Run any as `/<name>`.
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
for s in review postReview addressReview enhancePrompt bootstrap rootCause bugHunt bugReport shipRelease syncDocs weeklyRetro officeHours productReview archReview withInterview design-analyze design-analyze-web design-analyze-ios design-language design-evolve design-evolve-web design-evolve-ios design-mockup design-mockup-web design-mockup-ios design-implement design-implement-web design-implement-ios design-refine design-verify design-verify-web design-verify-ios verify-app verify-web verify-ios autoplan planDesignReview planDevexReview cso design-shotgun landAndDeploy canary prismStatus; do
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

Runs a two-axis security review (OWASP Top 10 + STRIDE) against either a plan doc or a PR diff. Each finding gets a severity rating (CRITICAL / HIGH / MEDIUM / LOW) and a concrete mitigation. Output goes to `~/.agentic-workflow/$REPO_SLUG/security/<target-slug>-threat-model.md`. Fits the pipeline at two points: pre-ship gate, or fanned out from `/autoplan` for early plan-stage security check.

## Inputs

- Mode flag: `--plan <path>` or `--diff <pr-or-branch>`
- Auto-detect: if no flag, try `gh pr view --json number,state` on current branch — if it succeeds, use `--diff <pr#>`; else `--plan` against `ls -t ~/.agentic-workflow/$REPO_SLUG/plans/*/plan.md | head -1`
- `--output <path>` (optional) — explicit output file path. `/autoplan` passes `--output <feature-dir>/security-review.md` to land the review inside the canonical feature dir; without this flag the default `security/<target-slug>-threat-model.md` path is used.

## Steps

1. Resolve mode and target.
2. Resolve `$REPO_SLUG` per `.claude/rules/skills.md` convention.
3. Read source material:
   - Plan mode: read the plan doc.
   - Diff mode: `gh pr diff <pr#>` OR `git diff main...HEAD` if branch-based.
4. **OWASP Top 10 pass** — for each, check if applicable to source material; if yes, identify any finding:
   - A01 Broken Access Control
   - A02 Cryptographic Failures
   - A03 Injection (SQL, command, template, etc.)
   - A04 Insecure Design
   - A05 Security Misconfiguration
   - A06 Vulnerable & Outdated Components
   - A07 Identification & Authentication Failures
   - A08 Software & Data Integrity Failures
   - A09 Security Logging & Monitoring Failures
   - A10 Server-Side Request Forgery (SSRF)
5. **STRIDE pass** — for each, identify any finding:
   - **S**poofing
   - **T**ampering
   - **R**epudiation
   - **I**nformation Disclosure
   - **D**enial of Service
   - **E**levation of Privilege
6. For each finding: title, severity (CRITICAL / HIGH / MEDIUM / LOW), description, attack scenario, mitigation.
7. Resolve target slug:
   - Plan mode: `<feature>` (parent dir of plan.md)
   - Diff mode: `pr-<pr#>` or `branch-<branch-name>`
8. Resolve output path:
   - If `--output <path>` was provided, use it verbatim. Ensure the parent dir exists with `mkdir -p "$(dirname <path>)"`.
   - Otherwise default to `~/.agentic-workflow/$REPO_SLUG/security/<target-slug>-threat-model.md`. Ensure `~/.agentic-workflow/$REPO_SLUG/security/` exists.
9. Write to the resolved output path:
   ```markdown
   # Threat Model — <target>

   **Mode:** plan | diff
   **Source:** <path or pr#>
   **Reviewed:** <ISO date>

   ## Summary
   <3–5 sentences. Worst findings, overall posture.>

   ## OWASP Top 10 findings
   ### A01 — Broken Access Control
   - **<title>** [CRITICAL]
     - Where: <file:line or plan-line>
     - Attack: <scenario>
     - Mitigation: <concrete fix>
   <etc. for each Axx with findings; omit if no findings>

   ## STRIDE findings
   ### S — Spoofing
   <findings or "No findings.">
   <etc.>

   ## Verdict
   - **Critical findings:** N
   - **High findings:** N
   - **Recommendation:** SHIP | FIX-CRITICAL-FIRST | DO-NOT-SHIP
   ```

## Outputs

- Default: `~/.agentic-workflow/$REPO_SLUG/security/<target-slug>-threat-model.md`
- When `--output <path>` is supplied: that exact path (used by `/autoplan` to land the review inside `plans/<feature>/security-review.md`)

## Pre-ship integration

`/shipRelease` does NOT currently auto-invoke `/cso`. To enable a security gate, users can:

1. **Manual gate** (recommended for now): run `/cso --diff` before invoking `/shipRelease`. If CRITICAL findings exist, address them before shipping.

2. **Hook gate** (advanced): add a pre-push hook that calls `claude /cso --diff` and exits non-zero on CRITICAL findings. See `.claude/rules/hooks.md` for hook conventions.

Future work: extend `/shipRelease` to optionally auto-invoke `/cso` with a `--cso-gate` flag that blocks ship on CRITICAL findings.

## Next steps

- `/review` — if pre-ship and findings exist, run general code review
- `/shipRelease` — if all findings are LOW or none
- `/rootCause` — if a CRITICAL finding maps to a known incident
