---
name: postReview
description: Publish a completed /review to GitHub as batched PR comments. Reads from ~/.agentic-workflow/<repo-slug>/reviews/<pr>.json and posts one review per agent (minimizing API calls). Use after /review has written a local state file and you are ready to publish.
argument-hint: [pr-number]
disable-model-invocation: true
allowed-tools: Bash(gh *), Bash(git *), Read, Edit
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

# Post Review to GitHub

Reads the local review state file and publishes all findings to GitHub in batched API calls — one review submission per agent.

## Step 1: Resolve the PR number

**If an argument was provided**, use it.

**If no argument**, detect from current branch:
```bash
gh pr list --head $(git branch --show-current) --json number,title,url
```

If multiple PRs found, list and ask the user to pick.

## Step 2: Load State File

Read `~/.agentic-workflow/{REPO_SLUG}/reviews/{number}.json`.

If the file does not exist:
> "No local review found for PR #{number}. Run `/review` first."

If `posted: true`:
> "PR #{number} was already posted at {posted_at}. Post again anyway? (yes/no)"
> Wait for confirmation before continuing.

## Step 3: Post Each Reviewer's Findings

For each entry in `reviewers`, post **one batched GitHub review** containing all that agent's inline comments plus a top-level summary body. This is a single API call per reviewer.

```bash
gh api repos/{owner}/{repo}/pulls/{number}/reviews \
  --method POST \
  --field commit_id="{commit_sha}" \
  --field body="{review_body}" \
  --field event="COMMENT" \
  --field "comments[]={inline_comments_json}"
```

Where:
- `{review_body}` is the reviewer's human-readable summary (see format below)
- `{inline_comments_json}` is a JSON array of all `type: "inline"` issues for this reviewer

### Review body format

```markdown
## {agent} Review
**Focus:** {focus}

{summary}

### Findings

| Severity | File | Issue |
|----------|------|-------|
| blocking | `src/auth.ts` | JWT not verified before use |
| issue | `src/api.ts` | SQL injection risk |

{top_level_issue_bodies}

<!-- review-data
{
  "agent": "{agent}",
  "focus": "{focus}",
  "issues": [ ... full issues array from state file ... ]
}
-->
```

`{top_level_issue_bodies}` — append the full `body` text of any `type: "top-level"` issues directly into the review body.

### Inline comment format

Each `type: "inline"` issue maps to:
```json
{
  "path": "src/auth.ts",
  "position": 42,
  "body": "**[blocking] JWT not verified**\n\nFull comment text..."
}
```

### Capture posted comment IDs

Parse the response to get the review ID and individual comment IDs:
```bash
RESPONSE=$(gh api repos/{owner}/{repo}/pulls/{number}/reviews \
  --method POST ... )

REVIEW_ID=$(echo $RESPONSE | jq '.id')
```

Store each returned comment ID back against the issue in the state file (`posted_comment_id`).

## Step 4: Update State File

After all reviews are posted, update `~/.agentic-workflow/{REPO_SLUG}/reviews/{number}.json`:
- Set `"posted": true`
- Set `"posted_at"` to current ISO timestamp
- Fill in `posted_comment_id` for each issue

Use the Edit tool to update the file.

## Step 5: Report

```
Posted to PR #{number}: "{title}"

  • security-sentinel — 3 comments (2 inline, 1 top-level)
  • kieran-typescript-reviewer — 2 comments (2 inline)
  • performance-oracle — 1 comment (1 top-level)

Total: 6 comments · 2 API calls

View: {pr_url}
```
