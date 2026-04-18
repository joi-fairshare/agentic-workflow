---
name: review
description: Orchestrate a multi-agent PR code review. Spawns domain-specific reviewer subagents in parallel based on changed files. Findings are saved to ~/.agentic-workflow/<repo-slug>/reviews/<pr>.json — run postReview to publish to GitHub.
---

## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.

# PR Review Orchestrator

Runs parallel domain-specific reviewers and saves findings locally. Does **not** post to GitHub — run `postReview` when ready.

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

If no PRs are found: "No open PR found for the current branch. Use `review <number>` to specify one."

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

If the user explicitly asked for delegated or parallel review help, spawn a general-purpose sub-agent with the triage prompt from [triage-prompt.md](triage-prompt.md). Otherwise, do the triage locally using that prompt as guidance.

Inject:
- `{title}`, `{body}` — PR metadata
- `{file_list}` — JSON array of changed file paths
- `{diff}` — full diff output

Parse the returned JSON array of reviewer assignments.

## Step 5: Spawn Parallel Reviewers

If the user explicitly asked for delegated or parallel review help, spawn all reviewer sub-agents simultaneously. Otherwise, review each area locally using [reviewer-prompt.md](reviewer-prompt.md) as the structure for each reviewer persona:
- `{agent}`, `{focus}`, `{number}`, `{title}`, `{diff}`

Each reviewer returns a **JSON object** as its final output (not GitHub comments). Collect all responses.

### Sub-skill Dispatch

After collecting all reviewer JSON outputs:
1. Check for any reviewer output with `investigation_needed: true`
2. If found: identify the single highest-confidence entry (blocking severity + clearest error trace)
3. Ask the user (conversationally):
   > "Found a blocking bug with a stack trace in {path}. Run rootCause to investigate? (yes/no)"
4. If yes: open and follow [rootCause](../rootCause/SKILL.md) with `"<investigation_error value>"`.
   - Attach the investigation file path to that issue in the state file under `"investigation"`
   - If rootCause returns `scope-breach`, note it in the state file and continue — do not block the review
5. If no, or no reviewer flagged `investigation_needed`: skip and proceed to writing the state file

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

Run postReview to publish comments to GitHub.
Run addressReview to start implementing fixes.
```
