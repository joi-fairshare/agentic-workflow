---
name: addressReview
description: Address PR review comments by spawning domain-specific implementation agents in parallel. Reads from ~/.agentic-workflow/<repo-slug>/reviews/<pr>.json as source of truth, merges any new human GitHub comments, implements fixes, and updates the state file. Can be re-run to continue the review loop.
---

## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.

# Address PR Review

Implements fixes for outstanding review issues. The local state file is the source of truth — run this as many times as needed until all issues are resolved.

## Step 1: Resolve the PR

**If an argument was provided**, use it directly:
```bash
gh pr view <argument> --json number,title,headRefName,baseRefName,url,headRepository
```

**If no argument**, auto-detect from the current branch:
```bash
gh pr list --head $(git branch --show-current) --json number,title,url
```

If multiple PRs are found, list them and ask the user to pick one.

If no PRs are found: "No open PR found for the current branch. Use `addressReview <number>` to specify one."

## Step 2: Load State File

Read `~/.agentic-workflow/{REPO_SLUG}/reviews/{number}.json`.

If the file does not exist:
> "No local review state found for PR #{number}. Run `review` first."

## Step 3: Fetch New Human Comments from GitHub

Fetch all GitHub comments created **after** `reviewed_at` in the state file:

```bash
# Top-level issue comments
gh api repos/{owner}/{repo}/issues/{number}/comments \
  --jq '[.[] | select(.created_at > "{reviewed_at}") | {id, body, user: .user.login, created_at, path: null, diff_position: null, source: "human"}]'

# Inline PR review comments
gh api repos/{owner}/{repo}/pulls/{number}/comments \
  --jq '[.[] | select(.created_at > "{reviewed_at}") | {id, body, user: .user.login, created_at, path, position, source: "human"}]'
```

Filter out comments posted by bots or CI systems (check `user.login` for `[bot]` suffix or known CI usernames).

Append any new comments to a `human_comments` array in the state file. Update `human_comments_fetched_at` to now.

## Step 4: Build the Issue List

Collect all unaddressed items:

**From state file** (`addressed: false`):
- All issues across all `reviewers[].issues` entries

**From new human comments** (all — humans comment when something needs attention):
- Each comment becomes a candidate issue for triage

**Filter by severity** (for structured issues):
- Default: `blocking` and `issue` only
- Pass `--all` to include `suggestion` and `nit`

Report to the user:
```
PR #{number}: "{title}"

Outstanding items:
  X blocking   (structured)
  Y issue      (structured)
  Z new human comments
  (W suggestions/nits skipped — pass --all to include)

Already addressed: N items
```

If everything is already addressed, stop:
> "All review items have been addressed. Consider running postReview if you haven't published yet."

## Step 5: Triage for Implementation

If the user explicitly asked for delegated or parallel implementation help, spawn a general-purpose sub-agent with the triage prompt from [address-triage-prompt.md](address-triage-prompt.md). Otherwise, do the triage locally using that prompt as guidance.

Inject:
- `{structured_issues}` — JSON array of unaddressed structured issues
- `{human_comments}` — JSON array of new human comments
- `{diff}` — output of `gh pr diff {number}`
- `{file_list}` — changed file paths

Parse the returned JSON array of implementation assignments.

## Step 6: Checkout and Spawn Parallel Implementers

Check out the PR branch:
```bash
gh pr checkout {number}
```

If the user explicitly asked for delegated or parallel implementation help, then spawn all implementation sub-agents simultaneously. Otherwise, implement the assignments locally while following [implementer-prompt.md](implementer-prompt.md) for structure:
- `{agent}`, `{focus}`, `{issues}` — from triage output
- `{number}`, `{owner}`, `{repo}`, `{branch}` — PR coordinates
- `{REPO_SLUG}` — repo slug derived in the preamble

## Step 7: Update State File

After all implementers complete, update `~/.agentic-workflow/{REPO_SLUG}/reviews/{number}.json`:

For each issue that was addressed:
- Set `"addressed": true`
- Set `"addressed_at"` to current ISO timestamp
- Set `"addressed_by"` to the agent name
- Set `"fix_commit"` to the commit SHA the agent reported

For new human comments that were addressed, add them to the state file under `human_comments` with the same fields.

Update `"last_addressed_at"` at the top level.

Use the Edit tool to update the file.

## Step 8: Report

```
Address complete for PR #{number}: "{title}"

Implemented:
  • security-engineer — 2 issues fixed (commit abc1234)
  • typescript-pro — 1 issue fixed (commit def5678)

Still outstanding (if any):
  [blocking] src/auth.ts — JWT not verified (agent error — address manually)

Run addressReview again to continue, or postReview to publish.
```
