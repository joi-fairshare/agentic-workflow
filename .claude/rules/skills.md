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
...22-skill table + output directory line...
...Bootstrap Check bash script...
<!-- === PREAMBLE END === -->
```

When updating `skills/_preamble.md`, you **must** propagate the change to all 22 SKILL.md files that embed it. Use `Grep` to find all files: search for `=== PREAMBLE START ===`.

The preamble verifies:
1. All 22 skills are symlinked to `~/.claude/skills/`
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
| Releases | `/shipRelease`, `/syncDocs` | `releases/` |
| Retrospectives | `/weeklyRetro` | `retros/` |
| Planning | `/officeHours`, `/productReview`, `/archReview` | `plans/` (`officeHours` writes to `plans/<feature>/`) |
| Design | `/design-mockup`, `/design-verify` | `design/` |
| Verification | `/verify-app` | `verification/` |

Skills that output files always write to `~/.agentic-workflow/$REPO_SLUG/<domain>/` — never to the project directory.

## Skill Pipeline

Skills flow into each other — each writes artifacts that downstream skills auto-discover:

```
officeHours → productReview / archReview
    → design-analyze → design-language → design-mockup → design-implement → design-refine → design-verify
                                        ^
                               design-evolve (anytime)
    → review → rootCause → bugHunt → shipRelease → syncDocs → weeklyRetro
    verify-app (anytime — standalone verification of running app)
```

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
5. Add a row to the skills table in `_preamble.md` and propagate to all 22 existing SKILL.md files
6. Update the skill count in the CLAUDE.md tagline (line 3)

## Symlink Installation

Skills are installed as symlinks:
```
~/.claude/skills/<name>/ → <repo>/skills/<name>/
~/.claude/skills/bootstrap/ → <repo>/bootstrap/
```

`setup.sh` manages symlinks with collision detection and stale-skill cleanup. The `install_skill()` function handles: up-to-date (skip), same-repo refresh, different-repo collision (prompt), real-directory collision (prompt).
