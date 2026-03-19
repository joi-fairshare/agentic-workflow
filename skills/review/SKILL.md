---
name: review
description: Orchestrate a multi-agent PR code review. Spawns domain-specific reviewer subagents in parallel based on changed files. Findings are saved locally to .review-cache/<pr>.json — run /postReview to publish to GitHub.
argument-hint: [pr-number-or-url]
disable-model-invocation: true
allowed-tools: Bash(gh *), Bash(git *), Agent, Read, Write
---

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

## Step 3: Ensure cache directory exists

```bash
mkdir -p .review-cache
```

Add to `.gitignore` if not already present:
```bash
grep -q '.review-cache' .gitignore 2>/dev/null || echo '.review-cache/' >> .gitignore
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

Combine all reviewer outputs into `.review-cache/{number}.json`:

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
Findings saved to .review-cache/{number}.json

Reviewers:
  • security-sentinel (focus: auth, input validation) — 2 blocking, 1 issue
  • kieran-typescript-reviewer (focus: type safety) — 0 issues

Run /postReview to publish comments to GitHub.
Run /addressReview to start implementing fixes.
```
