---
name: verify-app
description: "Detect web vs iOS automatically and delegate to /verify-web (Playwright) or /verify-ios (XcodeBuildMCP). Pass any arguments through unchanged."
argument-hint: "[--journey <path>] [--lenses <csv>] [--baseline] [--yes] [--base-url <url>] [--visual] [criteria or 'auto']"
allowed-tools: Bash(git *), Bash(ls *), Bash(mkdir *), Bash(SHARED_DIR=*), Bash(source *), Glob, Read, AskUserQuestion, Skill, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff
---
<!-- MEMORY: SKIP -->

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

---

# Verify App — Platform Dispatcher

Detects whether this is a web or iOS project and delegates to the appropriate verification skill. Contains no verification logic — all execution lives in the sub-skills.

> **Tip:** If you already know the platform, invoke directly: `/verify-web` or `/verify-ios`

## Platform Detection & Dispatch

Follow `_shared/platform-detection.md` — canonical detection Globs (with vendored-path excludes), the resolution table, and the dispatch contract. Resolve it from this skill's **own** symlink:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/verify-app/SKILL.md")")/../_shared"
ls "$SHARED_DIR/platform-detection.md"
```

If resolution or `ls` fails, stop and report — do not guess the platform. Otherwise Read the file and apply it: iOS → `verify-ios`, web → `verify-web`, both/neither → `AskUserQuestion`. Echo `dispatch: <sub-skill> args=<args>` before dispatching, then dispatch literally: `Skill(skill="<sub-skill>", args="<original args verbatim>")`.

## Argument Spec (pass-through)

All arguments are forwarded to the sub-skill **unchanged** — never drop or rewrite one:

| Argument | Meaning |
|----------|---------|
| `--journey <path>` | Path to a `verification-plan.md` (template: `_shared/verification-plan-template.md`) — the sub-skill executes its journeys |
| `--lenses <csv>` | Narrow the lens set (catalog: `_shared/verification-lenses.md`) |
| `--baseline` | Require visual diffing against `screens.json` baselines — the visual lens fails if none exist |
| `--yes` | Non-interactive: the sub-skill auto-approves its plan |
| `--base-url <url>` | Override app-URL detection (web only; still forwarded verbatim) |
| `--visual` | Include the visual lens |
| `auto` / criteria | Diff-inference mode / explicit verification criteria |

If `--journey` is given but the path does not exist, **stop** and report — do not dispatch with a blank or dead required arg.

## Sub-skill Return Contract

The sub-skill must produce an evidence pack (`_shared/evidence-pack.md`) and report back `{verdict, evidence_path}`:

- `verdict` ∈ `PASS | WARN | FAIL`
- `evidence_path` = absolute path to the `verification/<run-id>/` dir containing `pack.json`

After the sub-skill returns, confirm the pack exists:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/verify-app/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
ls -1dt "$AW_DIR/verification/"*/ | head -1
ls "$(ls -1dt "$AW_DIR/verification/"*/ | head -1)pack.json"
```

If the sub-skill returned no `{verdict, evidence_path}`, or the newest run dir has no `pack.json`, **fail loudly**:

> "verify sub-skill returned no evidence pack — verification is not proven. Treat this run as FAIL."

Relay the sub-skill's `verdict` and `evidence_path` verbatim in your final report. A FAIL verdict blocks PR-open / mark-ready (gate rule in `_shared/evidence-pack.md`).

## Auto-chain: design-verify

After a completed run, check whether `screens.json` baselines cover the screens the sub-skill verified:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/verify-app/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
ls "$AW_DIR/design/screens.json" 2>/dev/null || echo "no screens.json — skip design-verify chain"
```

If `screens.json` exists and has `baselines` entries for one or more of the verified screens, invoke `Skill(skill="design-verify", args="<verified screens>")` automatically and report its diff verdict alongside the verification verdict. If no baselines cover the verified screens, skip the chain silently.

## Next steps

- `/design-verify` — re-run design diffing on demand (auto-chained above when baselines cover verified screens)
- `/bugReport` — if functional gaps surfaced, capture them as a bug report
