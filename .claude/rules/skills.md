---
globs: ["skills/**", "bootstrap/**"]
---

# Skills Rules

## Skill Structure

Every skill lives in its own directory with a `SKILL.md` manifest:

```
skills/<name>/
├── SKILL.md          # Required: manifest + instructions
└── *.md              # Optional: subagent prompts, templates
```

`bootstrap/` follows the same structure (it's a skill, just in a different directory).

## SKILL.md Format

```yaml
---
name: skillName
description: One-sentence description of what this skill does
argument-hint: [optional argument syntax]
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(ls *), Agent, Read, Write, Glob, Grep, Skill
---
```

After the frontmatter closing `---`, include the full preamble block (copy from `skills/_preamble.md`).

## Preamble Block

Every SKILL.md embeds the shared preamble between these markers:

```markdown
<!-- === PREAMBLE START === -->
...skills table + output directory line...
...Bootstrap Check bash script...
<!-- === PREAMBLE END === -->
```

When updating `skills/_preamble.md`, you **must** propagate the change to all 43 SKILL.md files that embed it. Use `Grep` to find all files: search for `=== PREAMBLE START ===`.

The preamble verifies:
1. All 43 native skills are symlinked to `~/.claude/skills/` (plus 14 skills from the 3 fetched external packs)
2. The MCP bridge is built (`dist/mcp.js` exists)
3. The `.claude/rules/` directory exists in the project root
4. The repo-slug output directory `~/.agentic-workflow/$REPO_SLUG/` is created

If checks fail, offer to run `setup.sh`.

## Repo Slug Derivation

Used by all skills for output directory naming:

```bash
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ -n "$REMOTE_URL" ]; then
  REPO_SLUG=$(echo "$REMOTE_URL" | sed 's|.*[:/]\([^/]*/[^/]*\)\.git$|\1|;s|.*[:/]\([^/]*/[^/]*\)$|\1|' | tr '/' '-')
else
  REPO_SLUG=$(basename "$(pwd)")
fi
```

Result: `org-repo` (e.g., `myorg-myrepo`). All output paths use `~/.agentic-workflow/$REPO_SLUG/<domain>/`.

## Output Directories

| Domain | Skills | Path |
|--------|--------|------|
| Reviews | `/review`, `/postReview`, `/addressReview` | `reviews/` |
| Investigations | `/rootCause` | `investigations/` |
| QA | `/bugHunt`, `/bugReport` | `qa/` |
| Releases | `/shipRelease`, `/landAndDeploy`, `/canary`, `/syncDocs` | `releases/` |
| Retrospectives | `/weeklyRetro` | `retros/` |
| Planning | `/officeHours`, `/productReview`, `/archReview`, `/planDesignReview`, `/planDevexReview`, `/autoplan` | `plans/` (`officeHours` and `autoplan` write to `plans/<feature>/`) |
| Design | `/design-mockup`, `/design-verify`, `/design-shotgun` | `design/` (`design-shotgun` writes to `design/shotgun/`) |
| Verification | `/verify-app` | `verification/` |
| Security | `/cso` | `security/` |

Skills that output files always write to `~/.agentic-workflow/$REPO_SLUG/<domain>/` — never to the project directory.

## Skill Pipeline

Skills flow into each other — each writes artifacts that downstream skills auto-discover:

```
officeHours → autoplan ⟨productReview · archReview · planDesignReview · planDevexReview · cso(plan)⟩
   → design-analyze → design-language → design-shotgun → design-mockup → design-implement → design-refine → design-verify
                                        ^                                       (orchestrates impeccable + emil + taste)
                               design-evolve (anytime)
   → cso (pre-ship security gate)
   → review → rootCause → bugHunt → shipRelease → landAndDeploy → canary → syncDocs → weeklyRetro
   verify-app (anytime — standalone verification of running app)
   prismStatus (anytime — health check for prism-mcp)
```

## Meta-Orchestration

Three stage orchestrators fan out subagents in parallel and consolidate findings:

| Orchestrator | Stage | Fans out to |
|---|---|---|
| `/autoplan` | Plan | `productReview` + `archReview` + `planDesignReview` + `planDevexReview` + `cso(plan)` |
| `/design-refine` | Design | impeccable (umbrella) + emil-design-eng (reference) + taste-skill family (style packs) |
| `/shipRelease` | Ship | auto-chains → `landAndDeploy` → `canary` → `syncDocs` |

Every native pipeline skill ends its response with a `## Next steps` block listing 1–3 recommended successor skills with one-line reasons. Skills compose through structured suggestions and filesystem hand-off, not by importing each other's logic.

## Bootstrap Skill

`bootstrap/SKILL.md` generates documentation for any repo. Standard output:
- `planning/*.md` — up to 17 Pivot-pattern docs
- A trimmed `CLAUDE.md` (under 80 lines) with Required Context, Tech Stack, Commands, Merge Gate, Commits, and a pointer to `.claude/rules/`
- A `.claude/rules/` directory with glob-scoped rule files inferred from the repo's actual structure

When writing the bootstrap CLAUDE.md template, do not include Skills tables or Key Patterns — those belong in rule files. The CLAUDE.md should be a navigation document, not a reference manual.

## Adding a New Skill

1. Create `skills/<name>/SKILL.md` with YAML frontmatter
2. Copy the full preamble block from `skills/_preamble.md` immediately after the frontmatter `---`
3. Write the skill's steps after the preamble
4. Add the skill name to `setup.sh`'s `MANAGED_SKILLS` array
5. Add a row to the skills table in `_preamble.md` and propagate to all 43 existing SKILL.md files
6. Update the skill count in the CLAUDE.md tagline (line 3)

## Symlink Installation

Skills are installed as symlinks:
```
~/.claude/skills/<name>/ → <repo>/skills/<name>/
~/.claude/skills/bootstrap/ → <repo>/bootstrap/
```

`setup.sh` manages symlinks with collision detection and stale-skill cleanup. The `install_skill()` function handles: up-to-date (skip), same-repo refresh, different-repo collision (prompt), real-directory collision (prompt).

External packs (`pbakaus/impeccable`, `emilkowalski/skill`, `Leonxlnx/taste-skill`) are cloned at pinned commits (per `EXTERNAL_PINS.env`) into `~/.agentic-workflow/external-skills/<repo>/`. Their `skills/*/` (or `.claude/skills/*/`) subdirs are symlinked into `~/.claude/skills/` alongside native ones. Native symlinks pointing into this repo always win on name collision — external pack skills with matching names are skipped with a warning. Use `./scripts/refresh-external-pins.sh` to bump pinned SHAs to upstream HEAD.
