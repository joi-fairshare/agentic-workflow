---
name: postReview
description: Publish a completed review to GitHub as batched PR comments. Reads from ~/.agentic-workflow/<repo-slug>/reviews/<pr>.json and posts one review per agent (minimizing API calls). Use after review has written a local state file and you are ready to publish.
---

<!-- MEMORY: SKIP -->
## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.

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
> "No local review found for PR #{number}. Run `review` first."

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
