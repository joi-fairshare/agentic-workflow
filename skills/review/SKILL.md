---
name: review
description: Orchestrate a multi-agent PR code review. Spawns domain-specific reviewer subagents in parallel based on changed files. Findings are saved to ~/.agentic-workflow/<repo-slug>/reviews/<pr>.json — run /postReview to publish to GitHub.
argument-hint: [pr-number-or-url]
disable-model-invocation: true
allowed-tools: Bash(gh *), Bash(git *), Agent, Read, Write
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
> | `/officeHours` | Spec-driven brainstorming → EARS requirements + design doc |
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

## Preamble — Bootstrap Check

Before running this skill, verify the environment is set up:

```bash
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ -n "$REMOTE_URL" ]; then
  REPO_SLUG=$(echo "$REMOTE_URL" | sed 's|.*[:/]\([^/]*/[^/]*\)\.git$|\1|;s|.*[:/]\([^/]*/[^/]*\)$|\1|' | tr '/' '-')
else
  REPO_SLUG=$(basename "$(pwd)")
fi
echo "repo-slug: $REPO_SLUG"

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

```bash
mkdir -p "$HOME/.agentic-workflow/$REPO_SLUG/reviews"
```

---

<!-- === PREAMBLE END === -->

# PR Review Orchestrator

Runs parallel domain-specific reviewers and saves findings locally. Does **not** post to GitHub — run `/postReview` when ready.

## Step 1: Resolve the PR

**If an argument was provided**, use it directly:
```bash
gh pr view <argument> --json number,title,headRefName,baseRefName,url,headRepository
```

**If no argument was provided**, auto-detect from the current branch:
```bash
gh pr list --head $(git branch --show-current) --json number,title,url
```

If multiple PRs are returned, list them and ask the user to pick one before proceeding.

If no PRs are found: "No open PR found for the current branch. Use `/review <number>` to specify one."

## Step 2: Fetch PR Context

```bash
# Run in parallel
gh pr diff {number}
gh pr view {number} --json number,title,body,additions,deletions,headRefName,baseRefName,headRepository
gh pr view {number} --json files --jq '[.files[].path]'
gh pr view {number} --json commits --jq '.commits[-1].oid'
```

## Step 3: Ensure output directory exists

```bash
mkdir -p "$HOME/.agentic-workflow/$REPO_SLUG/reviews"
```

## Step 4: Triage

Spawn a **general-purpose** subagent with the triage prompt from [triage-prompt.md](triage-prompt.md).

Inject:
- `{title}`, `{body}` — PR metadata
- `{file_list}` — JSON array of changed file paths
- `{diff}` — full diff output

Parse the returned JSON array of reviewer assignments.

## Step 5: Spawn Parallel Reviewers

Spawn **all agents simultaneously** in a single message. Each reviewer receives the prompt from [reviewer-prompt.md](reviewer-prompt.md) with these values injected:
- `{agent}`, `{focus}`, `{number}`, `{title}`, `{diff}`

Each reviewer returns a **JSON object** as its final output (not GitHub comments). Collect all responses.

## Step 6: Write State File

Combine all reviewer outputs into `~/.agentic-workflow/{REPO_SLUG}/reviews/{number}.json`:

```json
{
  "pr": {
    "number": 123,
    "title": "Add auth middleware",
    "branch": "feature/auth",
    "owner": "myorg",
    "repo": "myrepo",
    "url": "https://github.com/myorg/myrepo/pull/123"
  },
  "commit_sha": "<latest commit oid>",
  "reviewed_at": "<ISO timestamp>",
  "posted": false,
  "posted_at": null,
  "reviewers": [
    {
      "agent": "security-sentinel",
      "focus": "auth, input validation",
      "summary": "Found 2 blocking issues...",
      "issues": [
        {
          "id": "sec-0",
          "severity": "blocking",
          "path": "src/auth.ts",
          "diff_position": 42,
          "summary": "JWT not verified before use",
          "body": "**[blocking] JWT not verified before use**\n\nFull comment text...",
          "type": "inline",
          "addressed": false,
          "posted_comment_id": null
        }
      ]
    }
  ]
}
```

Use the Write tool to save this file.

## Step 7: Report to User

```
Review complete for PR #{number}: "{title}"
Findings saved to ~/.agentic-workflow/{REPO_SLUG}/reviews/{number}.json

Reviewers:
  • security-sentinel (focus: auth, input validation) — 2 blocking, 1 issue
  • kieran-typescript-reviewer (focus: type safety) — 0 issues

Run /postReview to publish comments to GitHub.
Run /addressReview to start implementing fixes.
```
