---
name: canary
description: "Post-deploy monitoring. Watches error rate, latency, logs, and custom probes for a configurable window. Verdict: HEALTHY (chain syncDocs), DEGRADED (warn), UNHEALTHY (alert + rootCause)."
argument-hint: "[release-id] [--duration <sec>] [--setup]"
allowed-tools: Bash(curl *), Bash(jq *), Bash(*), Read, Write, Skill
---

# Canary — Post-Deploy Monitoring

Watches prod error rate, latency, logs, and custom probes for a configurable window after deploy. Returns a verdict that drives the next-step chain.

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
for s in review postReview addressReview enhancePrompt bootstrap rootCause bugHunt bugReport shipRelease syncDocs weeklyRetro officeHours productReview archReview withInterview design-analyze design-analyze-web design-analyze-ios design-language design-evolve design-evolve-web design-evolve-ios design-mockup design-mockup-web design-mockup-ios design-implement design-implement-web design-implement-ios design-refine design-verify design-verify-web design-verify-ios verify-app verify-web verify-ios; do
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

Reads `.agentic-workflow/canary.json` for monitoring URLs and probes. Runs minute-by-minute checks for `duration` seconds (default 900 = 15 min). Computes a verdict: HEALTHY, DEGRADED, or UNHEALTHY. Writes a timeline to `releases/<release-id>/canary.md`. On HEALTHY, auto-chains `/syncDocs`. On DEGRADED, warns and stops. On UNHEALTHY, alerts and suggests `/rootCause` — does NOT auto-chain (human decides next step).

## Inputs

- Release ID (positional arg). If omitted, auto-discover latest:
  ```bash
  ls -1d ~/.agentic-workflow/$REPO_SLUG/releases/*/ | sort -r | head -1
  ```
- `--duration <sec>` (optional). Overrides `canary.duration` from config.
- `--setup` flag: run interactive wizard to write `.agentic-workflow/canary.json`, then exit.
- Config file: `.agentic-workflow/canary.json` in project root.

## Config schema (`.agentic-workflow/canary.json`)

```json
{
  "duration": 900,
  "errorRateUrl": "https://example.com/metrics/error-rate",
  "latencyUrl": "https://example.com/metrics/latency",
  "logSource": "kubectl logs deploy/api --since=60s",
  "logAnomalyPatterns": ["FATAL", "OOMKilled", "panic:"],
  "customProbes": [
    { "name": "checkout-flow", "command": "npm run smoke:checkout", "critical": true }
  ],
  "thresholds": {
    "errorRateDegradedMultiplier": 2,
    "errorRateUnhealthyMultiplier": 5,
    "latencyDegradedMultiplier": 2
  }
}
```

- `duration` — monitoring window in seconds.
- `errorRateUrl` — endpoint returning current error rate (numeric JSON or plain number).
- `latencyUrl` — endpoint returning `{p50,p95,p99}` in ms.
- `logSource` — shell command that prints recent log lines (last 60s).
- `logAnomalyPatterns` — substrings/regexes that mark a critical log anomaly.
- `customProbes[]` — extra checks. `critical:true` failures bump verdict to UNHEALTHY.
- `thresholds` — multipliers vs pre-deploy baseline. Captured from first probe minute.

## --setup Wizard

When invoked with `--setup`, prompt the user (one question per AskUserQuestion call):

1. Monitoring duration in seconds (default 900)
2. Error rate URL
3. Latency URL
4. Log source command (default `kubectl logs deploy/api --since=60s`; can be empty)
5. Log anomaly patterns (comma-separated; common defaults: `FATAL,OOMKilled,panic:`)
6. Custom probe name + command + critical? (loop until user says done)

Write `.agentic-workflow/canary.json`. Exit without monitoring.

## Steps (normal mode)

1. If `--setup`: run wizard and exit.

2. Resolve release-id (arg or latest from `releases/`).

3. Resolve `$REPO_SLUG` per `.claude/rules/skills.md` convention.

4. Load `.agentic-workflow/canary.json`. If missing, suggest `--setup` and exit.

5. Determine duration (`--duration` arg > config `duration` > default 900).

6. Compute baseline values on first probe minute:
   - Initial `errorRateUrl` value → `baseline.errorRate`
   - Initial `latencyUrl` p95 → `baseline.p95`

7. Probe loop — every 60 s for `duration / 60` iterations:
   - Fetch `errorRateUrl` → current error rate
   - Fetch `latencyUrl` → current p50/p95/p99
   - If `logSource` set: run it; check stdout against `logAnomalyPatterns`. Record any matches.
   - For each `customProbes[]`: run the command; record exit code + duration.
   - Append a row to the timeline (in memory; written at the end).

8. Compute verdict after the loop:
   - **UNHEALTHY** if ANY of:
     - A `critical:true` custom probe failed at any point
     - Error rate exceeded `baseline.errorRate * errorRateUnhealthyMultiplier` for ≥2 consecutive minutes
     - Any log anomaly pattern matched (critical)
   - **DEGRADED** if ANY of (and not UNHEALTHY):
     - A non-critical custom probe failed
     - Error rate exceeded `baseline.errorRate * errorRateDegradedMultiplier`
     - p95 latency exceeded `baseline.p95 * latencyDegradedMultiplier`
   - **HEALTHY** otherwise.

9. Write `~/.agentic-workflow/$REPO_SLUG/releases/<release-id>/canary.md`:
   ```markdown
   # Canary — <release-id>

   **Started:** <ISO date>
   **Duration:** <sec>s
   **Verdict:** HEALTHY | DEGRADED | UNHEALTHY

   ## Baseline
   - Error rate: <baseline>
   - Latency p95: <baseline> ms

   ## Timeline
   | Minute | Error rate | p50 | p95 | p99 | Log anomalies | Probes |
   |---|---|---|---|---|---|---|
   | 1 | … | … | … | … | none | all pass |
   <…>

   ## Triggers
   - <reason verdict was DEGRADED/UNHEALTHY, or "no triggers" if HEALTHY>

   ## Recommended next
   - HEALTHY → /syncDocs (auto-chained)
   - DEGRADED → review timeline, decide whether to roll back
   - UNHEALTHY → /rootCause
   ```

10. Branch on verdict:
    - **HEALTHY:** invoke `/syncDocs` via `Skill` tool.
    - **DEGRADED:** print warning to stdout. Do NOT auto-chain.
    - **UNHEALTHY:** print alert + suggest `/rootCause`. Do NOT auto-chain.

## Outputs

- `~/.agentic-workflow/$REPO_SLUG/releases/<release-id>/canary.md`
- `.agentic-workflow/canary.json` (only on `--setup`)

## Next steps

- `/syncDocs` — auto-chained on HEALTHY
- `/rootCause` — recommended on UNHEALTHY
- Manual rollback (`gh pr revert` or repo-specific path) — recommended on DEGRADED if rolling forward isn't viable
