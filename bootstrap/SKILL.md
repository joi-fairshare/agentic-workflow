---
name: bootstrap
description: Analyze a repo's documentation coverage against the Pivot doc standard (17 planning docs + CLAUDE.md + design language), then generate any missing docs adapted to the target repo's tech stack and domain. Calls /enhancePrompt first for context.
argument-hint: [--force to regenerate existing docs]
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(ls *), Bash(find *), Agent, Read, Write, Glob, Grep, Skill
---

<!-- === PREAMBLE START === -->

> **Agentic Workflow** — 21 skills available. Run any as `/<name>`.
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
>
> **Output directory:** `~/.agentic-workflow/<repo-slug>/`
>
> **MCP Servers** — available in every session. Prefer these over built-in tools.
>
> | Server | When to reach for it |
> |--------|---------------------|
> | `serena` | Code structure: find symbol, find usages, call hierarchy — use instead of Grep+Read |
> | `agentic-bridge` | Multi-agent messaging and memory graph |
> | `context7` | Current library/framework docs |
> | `playwright` | Browser automation, screenshots, DOM inspection |
> | `github` | PRs, issues, releases via GitHub API |
> | `design-comparison` | Visual diff between implementation and design |
> | `mobai` | Mobile device automation |

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
for s in review postReview addressReview enhancePrompt bootstrap rootCause bugHunt bugReport shipRelease syncDocs weeklyRetro officeHours productReview archReview design-analyze design-language design-evolve design-mockup design-implement design-refine design-verify; do
  [ -d "$HOME/.claude/skills/$s" ] || SKILLS_OK=false
done

BRIDGE_OK=false
[ -f "$(dirname "$(readlink -f "$HOME/.claude/skills/review/SKILL.md" 2>/dev/null || echo /dev/null)")/../mcp-bridge/dist/mcp.js" ] 2>/dev/null && BRIDGE_OK=true

RULES_OK=false
[ -d ".claude/rules" ] && [ -n "$(ls -A .claude/rules/ 2>/dev/null)" ] && RULES_OK=true

echo "skills-symlinked: $SKILLS_OK"
echo "bridge-built: $BRIDGE_OK"
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

---

<!-- === PREAMBLE END === -->

# Bootstrap — Repo Documentation Generator

Orchestrates documentation generation for any repository. Detects existing coverage, generates missing docs using Pivot-pattern templates, and creates a CLAUDE.md if none exists.

## Step 1: Enhance Context

Invoke `/enhancePrompt` with the prompt:
> "Analyze this repository to understand its tech stack, architecture, domain, and existing documentation. I need to generate comprehensive planning documents."

Wait for the enhanced prompt. Proceed with the enriched context.

## Step 2: Gather Repo Intelligence

Run these in parallel to understand the target repo:

```bash
# Tech stack detection
ls package.json Gemfile requirements.txt Cargo.toml go.mod build.gradle pom.xml *.xcodeproj Podfile 2>/dev/null

# Framework detection
cat package.json 2>/dev/null | head -50
cat Gemfile 2>/dev/null | head -30

# Directory structure
find . -maxdepth 3 -type d -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/vendor/*' | head -80

# Git info
git remote -v 2>/dev/null
git log --oneline -10 2>/dev/null
```

Read any existing `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, or files in `docs/`, `planning/`, `.docs/`.

## Step 3: Audit Documentation Coverage

Check for each of the 17 Pivot-pattern documents. Search flexibly — docs may exist under different names or be embedded in other files:

| Doc ID | Search patterns |
|--------|----------------|
| `BUSINESS_PLAN` | `*business*plan*`, `*monetization*`, `*revenue*` |
| `PRODUCT_ROADMAP` | `*roadmap*`, `*product*plan*`, `*milestones*` |
| `ARCHITECTURE` | `*architecture*`, `*system*design*`, `*tech*spec*` |
| `ERD` | `*erd*`, `*entity*`, `*schema*`, `*data*model*` |
| `DEPENDENCY_GRAPH` | `*depend*`, `*framework*`, `*requirements*` |
| `API_CONTRACT` | `*api*`, `*contract*`, `*endpoints*`, `*routes*` |
| `DESIGN_SYSTEM` | `*design*system*`, `*style*guide*`, `*tokens*`, `*theme*` |
| `CODE_STYLE` | `*code*style*`, `*lint*`, `*conventions*`, `*style*` |
| `COMMIT_STRATEGY` | `*commit*`, `*branching*`, `*git*flow*` |
| `PR_GUIDE` | `*pr*guide*`, `*pull*request*`, `*review*checklist*` |
| `TESTING` | `*testing*`, `*test*strategy*`, `*coverage*` |
| `CI_CD` | `*ci*`, `*cd*`, `*pipeline*`, `*github*actions*`, `*workflow*` |
| `DEPLOYMENT` | `*deploy*`, `*release*`, `*ship*` |
| `LOCAL_DEV` | `*local*dev*`, `*setup*`, `*getting*started*`, `*contributing*` |
| `ANALYTICS` | `*analytics*`, `*tracking*`, `*events*`, `*metrics*` |
| `COMPETITIVE_ANALYSIS` | `*competitive*`, `*competitor*`, `*market*analysis*` |
| `GO_TO_MARKET` | `*go*to*market*`, `*gtm*`, `*launch*`, `*marketing*` |

Also check if a `CLAUDE.md` exists and whether a `.claude/rules/` directory already exists (and if so, how many files it contains).

Report findings:
```
Documentation Audit
===================

Found (N/17):
  ARCHITECTURE     — planning/ARCHITECTURE.md
  API_CONTRACT     — planning/API_CONTRACT.md
  ERD              — planning/ERD.md

Missing (M/17):
  BUSINESS_PLAN
  PRODUCT_ROADMAP
  DESIGN_SYSTEM
  CODE_STYLE
  COMMIT_STRATEGY
  PR_GUIDE
  TESTING
  CI_CD
  DEPLOYMENT
  LOCAL_DEV
  ANALYTICS
  COMPETITIVE_ANALYSIS
  GO_TO_MARKET
  DEPENDENCY_GRAPH

CLAUDE.md:       [exists / missing]
.claude/rules/:  [exists (N files) / missing]
```

If `--force` was passed, treat all docs as missing and regenerate.

## Step 4: Handle Each Scenario

### Bare repo (0–2 docs found)
Generate all 17 docs + CLAUDE.md. Spawn agents in batches of 4–5 to avoid overwhelming context.

### Partially documented (3–14 docs found)
Generate only missing docs. Read existing docs first to maintain consistency in terminology, formatting, and cross-references.

### Well-documented (15+ docs found)
Report completeness. For each existing doc, note if it could be improved (missing sections compared to Pivot template). Ask user if they want refinement suggestions.

## Step 5: Generate Missing Docs

For each missing doc, spawn an **Explore** agent to research the repo, then a **general-purpose** agent to write the doc.

### Generation Rules

1. **Adapt to the tech stack.** A Python/Django repo gets Django-specific architecture, pytest testing patterns, pip dependency management — not Swift/Firebase patterns.

2. **Follow the Pivot template structure.** Each doc type has a consistent format:
   - `BUSINESS_PLAN` — Executive summary, monetization model, unit economics tables, revenue projections, break-even analysis
   - `PRODUCT_ROADMAP` — Vision, versioned releases with scope/success criteria/timeline tables
   - `ARCHITECTURE` — System overview diagram, directory tree, layer descriptions, key rules
   - `ERD` — Relationship diagram, collection/table schemas with field tables
   - `DEPENDENCY_GRAPH` — Framework requirements, version constraints, layer dependency map
   - `API_CONTRACT` — Per-endpoint: trigger, path, request/response schemas, error cases, side effects
   - `DESIGN_SYSTEM` — Design principles, color tokens, typography scale, spacing, components. Points to `.impeccable.md` (brand personality) and `design-tokens.json` (W3C DTCG tokens) as operational artifacts. Run `/design-analyze` and `/design-language` to generate these.
   - `CODE_STYLE` — Linter config, naming conventions, import ordering, patterns
   - `COMMIT_STRATEGY` — Message format template, examples, branch naming table
   - `PR_GUIDE` — Categorized checkbox checklists (architecture, security, testing, etc.)
   - `TESTING` — Coverage targets, layer-based strategy (unit/integration/e2e), example code
   - `CI_CD` — Pipeline diagram, stage descriptions, required secrets table
   - `DEPLOYMENT` — Release workflow, promotion path, checklists, monitoring
   - `LOCAL_DEV` — Prerequisites table, setup commands, environment config, running locally
   - `ANALYTICS` — Event catalog with property tables, funnel diagrams
   - `COMPETITIVE_ANALYSIS` — Competitor profiles (overview/strengths/weaknesses), positioning matrix
   - `GO_TO_MARKET` — User segments with profiles/behavior/channels, launch strategy

3. **Use real data.** Read the actual codebase to populate architecture trees, dependency lists, API endpoints, test commands, etc. Don't invent placeholder content.

4. **Cross-reference.** New docs should reference each other where appropriate (e.g., TESTING references CODE_STYLE, DEPLOYMENT references CI_CD).

5. **Place docs in `planning/`.** Create the directory if it doesn't exist. Use UPPER_SNAKE_CASE filenames with `.md` extension.

## Step 6: Generate CLAUDE.md + .claude/rules/ (if missing)

### Step 6a: Generate CLAUDE.md

Create a trimmed CLAUDE.md (under 80 lines) that serves as a navigation document — not a reference manual. Include only:

```markdown
# CLAUDE.md — {Project Name}

> {one-line tagline describing the project}

Domain-specific rules are in `.claude/rules/` — they load automatically when working on matching files.

## Required Context

Read before making changes:

| Document | Purpose |
|----------|---------|
| `planning/ARCHITECTURE.md` | System components and data flow |
| `planning/API_CONTRACT.md` | Endpoint specifications |
| `planning/CODE_STYLE.md` | Language conventions and patterns |
| `planning/TESTING.md` | Test strategy and coverage targets |
| `planning/ERD.md` | Data model and relationships |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| {layer} | {technologies} |

## Directory Structure

```
{project-root}/
├── {dir}/   # {purpose}
├── {dir}/   # {purpose}
└── ...
```

## Commands

```bash
{key commands for build, test, dev, setup}
```

## Merge Gate

Before merging any PR:
1. {requirement 1}
2. {requirement 2}

## Commit Conventions

Format: `type: short description`
Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
```

Do **not** include: Skills tables, Key Patterns code blocks, Design Language sections, Architecture trees longer than 8 lines, or Implementation Guidelines. Those belong in `.claude/rules/` files.

### Step 6b: Generate .claude/rules/

After generating CLAUDE.md, inspect the target repo's directory structure and tech stack to generate a `.claude/rules/` directory with glob-scoped rule files. Each rule file loads automatically when Claude Code works on matching files.

**Infer rule file groupings from what directories actually exist.** Examples by tech stack:

| Tech Stack | Rule Files to Generate |
|------------|----------------------|
| Rails | `models.md` (app/models/**), `controllers.md` (app/controllers/**), `spec.md` (spec/**) |
| Next.js | `components.md` (components/**), `hooks.md` (hooks/**), `pages.md` (app/**) |
| Python | `services.md` (src/services/**), `tests.md` (tests/**) |
| Node.js + TypeScript | `services.md` (src/**), `tests.md` (**/*.test.ts) |
| Django | `models.md` (*/models.py), `views.md` (*/views.py), `tests.md` (*/tests.py) |
| Go | `handlers.md` (internal/handlers/**), `domain.md` (internal/domain/**) |

**Each generated rule file must:**
1. Start with YAML frontmatter: `globs: [list of glob patterns]`
2. Contain domain-specific guidance drawn from the repo's actual code patterns (read the code — don't template-fill)
3. Focus on patterns, conventions, and pitfalls specific to that domain

**Rule file template:**

```markdown
---
globs: ["{pattern1}", "{pattern2}"]
---

# {Domain} Rules

## {Key Pattern}

{Specific, actionable guidance drawn from the actual codebase — naming conventions,
required patterns, things to avoid, code examples from the real code.}

## {Another Pattern}

...
```

Spawn an Explore agent to read representative files in each domain before writing the rules. Rules should reflect what the code actually does, not generic best practices.

## Step 7: Generate .serena/project.yml

After generating docs and CLAUDE.md, configure Serena LSP for the repo.

**Language detection** (check repo root and one level deep):
- TS/JS: `tsconfig.json` or `package.json` → `typescript`
- Python: `*.py`, `pyproject.toml`, or `requirements.txt` → `python`
- Go: `go.mod` or `*.go` → `go`
- Rust: `Cargo.toml` or `*.rs` → `rust`
- C#: `*.csproj` or `*.cs` → detected but **excluded from languages list** (see below)
- Swift: `*.swift` or `Package.swift` → detected but **excluded from languages list** (see below)

**Language exclusions:** Do NOT add `swift` or `csharp` to the `languages:` list in the generated config:
- `swift` — sourcekit-lsp is a macOS binary; Serena runs in a Linux Docker container. Swift LSP requires the separate `serena-local:latest-swift` image and host-side socket bridge. Add manually after running `BUILD_SWIFT=1 ./setup.sh`.
- `csharp` — requires the `-csharp` image variant. Add manually after running `BUILD_CSHARP=1 ./setup.sh`.

**Sensitive path audit:** flag `.claude/`, `config/`, `secrets*`, `*.env`, `docs/` subdirectories → add to `ignored_paths`.

**RULES_OK check:**
```bash
RULES_OK=false
[ -d ".claude/rules" ] && RULES_OK=true
echo "rules-directory: $RULES_OK"
```
If `RULES_OK=false`, print:
> "WARN: .claude/rules/ not found — domain rules won't load. Consider running /bootstrap from the agentic-workflow repo to set up rules."

**Derive repo name for project_name field:**
```bash
REPO_NAME="$(basename "$(pwd)")"
```

**Write `.serena/project.yml`** with detected `languages` and audited `ignored_paths`:

```yaml
# Serena project configuration for <repo-name>
# --context claude-code disables execute_shell_command at Serena level.

project_name: <REPO_NAME>

languages:
- <detected-language-1>
- <detected-language-2>  # if applicable
# swift omitted: sourcekit-lsp requires macOS; add after running BUILD_SWIFT=1 ./setup.sh
# csharp omitted by default; add after running BUILD_CSHARP=1 ./setup.sh

read_only: false
ignore_all_files_in_gitignore: true

ignored_paths:
- .claude          # if exists
- config           # if exists and may contain tokens
- <other-sensitive-paths>

excluded_tools:
- write_memory
- read_memory
- onboarding
- execute_shell_command

initial_prompt: ""
```

**Append to `.gitignore`** (idempotent — check before writing):
```gitignore
# Serena runtime data (LSP index caches, logs, session state)
.serena/cache/
.serena/logs/
.serena/memory/
.serena/*.log
```

**Bootstrap the config via Docker (required — expands project.yml to full schema):**

Serena validates `project.yml` on startup and will crash if any required fields are missing. Bootstrap by running Serena once WITHOUT the `:ro` mount so it can write the expanded config:

```bash
REPO_PATH="$(pwd)"
REPO_NAME="$(basename "$REPO_PATH" | tr -c '[:alnum:]-_.' '-')"
mkdir -p "${REPO_PATH}/.serena/cache" "${REPO_PATH}/.serena/logs" "${REPO_PATH}/.serena/memory"
docker run --rm \
  -v "${REPO_PATH}:/workspaces/projects/${REPO_NAME}" \
  -v "${REPO_PATH}/.serena/cache:/workspaces/projects/${REPO_NAME}/.serena/cache" \
  -v "${REPO_PATH}/.serena/logs:/workspaces/projects/${REPO_NAME}/.serena/logs" \
  -v "${REPO_PATH}/.serena/memory:/workspaces/projects/${REPO_NAME}/.serena/memory" \
  serena-local:latest \
  serena start-mcp-server \
  --context claude-code \
  --project "/workspaces/projects/${REPO_NAME}" &
SPID=$!
sleep 5
kill $SPID 2>/dev/null || true
```

After this, `.serena/project.yml` will be fully expanded with all required fields. Subsequent `serena-docker` invocations mount the project read-only and will start without errors.

If the Docker command fails (image not built, Docker not running), do NOT abort bootstrap — print a warning and continue:
> `WARN: Could not bootstrap .serena/project.yml via Docker. The config is minimal and Serena may fail to start. Run setup.sh to build the serena-local image, then re-run /bootstrap.`

**Print summary:**
```
Serena configured. Languages: [<list>]. Run setup.sh if Serena image not yet built.
```

If `csharp` was detected, append:
> NOTE: C# requires the csharp image. Run `BUILD_CSHARP=1 ./setup.sh` to build it, then add `- csharp` to `.serena/project.yml`.

If `swift` was detected, append:
> NOTE: Swift LSP requires a host-side socket bridge. Run `BUILD_SWIFT=1 ./setup.sh` to build it, then add `- swift` to `.serena/project.yml`.

**Run Serena onboarding check (non-fatal):** After the Docker bootstrap step, call the `check_onboarding_performed` Serena MCP tool to initialize Serena with the repo context. This indexes the project and ensures symbol navigation is ready for use in this session.

> **Important — tool name:** Call `check_onboarding_performed`, not `onboarding`. The `onboarding` tool is explicitly excluded in the generated `project.yml`. Using `onboarding` will be rejected by Serena.

> **Non-fatal:** If `check_onboarding_performed` fails (e.g., Docker is not running or the Serena image has not been built yet), do **not** abort bootstrap. Print the following warning and continue:
> `WARN: Serena not available — the project.yml must be bootstrapped before Serena will connect. Build the serena-local Docker image with setup.sh, then re-run /bootstrap.`

## Step 8: Report

```
Bootstrap Complete
==================

Generated:
  planning/BUSINESS_PLAN.md          (new)
  planning/PRODUCT_ROADMAP.md        (new)
  planning/CODE_STYLE.md             (new)
  ...
  CLAUDE.md                          (new)

Existing (unchanged):
  planning/ARCHITECTURE.md
  planning/API_CONTRACT.md
  planning/ERD.md

Total: 17/17 docs + CLAUDE.md + .claude/rules/ + design language

Next steps:
  1. Review generated docs for accuracy
  2. Commit: git add planning/ CLAUDE.md .claude/ && git commit -m "docs: bootstrap planning documents"
  3. Refine any docs that need domain-specific detail

Suggested workflow:
  • /officeHours — brainstorm a feature or problem before planning
  • /productReview — get founder-lens feedback on a plan
  • /archReview — get engineering architecture review of a plan
  • /design-analyze <url> — extract design tokens from reference sites
  • /design-language — define brand personality and aesthetic direction
  • /design-mockup <screen> — generate HTML mockup from design language
  • /design-implement web|swiftui — generate production code from mockup
  • /design-refine — apply Impeccable design refinements
  • /design-verify — screenshot diff implementation vs mockup
  • /review <pr> — run multi-agent code review on a PR
  • /bugHunt — find and fix bugs with regression tests
  • /bugReport — audit code health without making changes
  • /rootCause — systematic 4-phase debugging
  • /shipRelease — push, open PR, sync docs
  • /weeklyRetro — generate a weekly retrospective
```
