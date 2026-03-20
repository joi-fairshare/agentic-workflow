---
name: bootstrap
description: Analyze a repo's documentation coverage against the Pivot doc standard (17 planning docs + CLAUDE.md), then generate any missing docs adapted to the target repo's tech stack and domain. Calls /enhancePrompt first for context.
argument-hint: [--force to regenerate existing docs]
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(ls *), Bash(find *), Agent, Read, Write, Glob, Grep, Skill
---

> **Agentic Workflow** — 14 skills available. Run any as `/<name>`.
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
for s in review postReview addressReview enhancePrompt bootstrap rootCause bugHunt bugReport shipRelease syncDocs weeklyRetro officeHours productReview archReview; do
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
```

---

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

Also check if a `CLAUDE.md` exists.

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

CLAUDE.md: [exists / missing]
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
   - `DESIGN_SYSTEM` — Design principles, color tokens, typography scale, spacing, components
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

## Step 6: Generate CLAUDE.md (if missing)

Create a CLAUDE.md following this structure (adapted from Pivot and FairShareEstate patterns):

```markdown
# CLAUDE.md — {Project Name} Developer Prompt

Read `/README.md` for project overview.
Read `/planning/ARCHITECTURE.md` for system architecture and dependencies.
Read `/planning/ERD.md` for data model and relationships.
Read `/planning/API_CONTRACT.md` for endpoint specifications.
These documents are required context before making changes.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| {layer} | {technologies} |

## Code Style

{key rules from CODE_STYLE or inferred from linter configs}

## Architecture

{ASCII directory tree showing key directories with inline comments}

### Key Rules

1. {architectural constraint with rationale}
2. ...

## Implementation Guidelines

1. {step-by-step workflow for adding features}
2. ...

## Testing

| Command | What it runs |
|---------|-------------|
| `{cmd}` | {description} |

### File Locations

| Pattern | Location |
|---------|----------|
| Unit tests | `{path}` |

## Merge Gate

- {requirement 1}
- {requirement 2}

## Commits

{format template, branch naming table}

## What to Output

1. **What changed** — files touched and why
2. **What to run** — commands to verify
3. **What to review** — areas needing human judgment
4. **What is left** — remaining work if task is incomplete
```

## Step 7: Report

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

Total: 17/17 docs + CLAUDE.md

Next steps:
  1. Review generated docs for accuracy
  2. Commit: git add planning/ CLAUDE.md && git commit -m "docs: bootstrap planning documents"
  3. Refine any docs that need domain-specific detail

Suggested workflow:
  • /officeHours — brainstorm a feature or problem before planning
  • /productReview — get founder-lens feedback on a plan
  • /archReview — get engineering architecture review of a plan
  • /review <pr> — run multi-agent code review on a PR
  • /bugHunt — find and fix bugs with regression tests
  • /bugReport — audit code health without making changes
  • /rootCause — systematic 4-phase debugging
  • /shipRelease — push, open PR, sync docs
  • /weeklyRetro — generate a weekly retrospective
```
