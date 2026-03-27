---
globs: ["config/hooks/**", "config/settings.json"]
---

# Hooks Rules

Safety hooks run automatically via Claude Code's hook system. All hooks are installed to `~/.claude/hooks/` by `setup.sh`.

## PreToolUse Hooks (matcher: `Bash`)

| Hook | Blocks | Suggestion |
|------|--------|------------|
| `block-destructive.sh` | `rm -rf`, `git reset --hard`, `git push --force` (not `--force-with-lease`), `git checkout .`, `git clean -f` | Use safer alternatives (trash, stash, etc.) |
| `block-push-main.sh` | `git push` to main/master (explicit ref or implicit via current branch) | Create a feature branch and open a PR |
| `detect-secrets.sh` | AWS keys (`AKIA...`), GitHub tokens (`ghp_/gho_/ghs_`), Bearer tokens in curl, secret env var assignments (>20 chars) | Use `.env` files, secrets manager, or `gh auth login` |
| `rtk-rewrite.sh` | Rewrites eligible commands (`git`, `vitest`, `npm test`, `tsc`, `eslint`, `cargo`, `next build`) to `rtk <command>` for token compression | — |

`rtk-rewrite.sh` runs 4th in the Bash chain — after all three safety hooks — so safety checks always see the original unmodified command.

## SessionStart Hooks

| Hook | Outputs |
|------|---------|
| `git-context.sh` | Current branch, last 5 commits, working tree status |
| `bridge-context.sh` | Recent decisions, topics, and tasks from the repo's memory graph (no-ops silently if bridge is down) |

## Hook Protocols

**PreToolUse protocol:**
- Scripts read JSON from stdin: `{"tool_name": "...", "tool_input": {...}}`
- Exit 0 = allow the tool call to proceed
- Exit 2 = deny with a message on stdout explaining why

**SessionStart protocol:**
- No stdin input — scripts receive no data from Claude Code
- Output context or information to stdout (Claude Code displays it at session start)
- Exit code is ignored

## Hook Files

All hook scripts live in `config/hooks/`:

| File | Type | Matcher |
|------|------|---------|
| `block-destructive.sh` | PreToolUse | `Bash` |
| `block-push-main.sh` | PreToolUse | `Bash` |
| `detect-secrets.sh` | PreToolUse | `Bash` |
| `rtk-rewrite.sh` | PreToolUse | `Bash` |
| `git-context.sh` | SessionStart | — |
| `bridge-context.sh` | SessionStart | — |

`setup.sh` installs them by copying (not symlinking) to `~/.claude/hooks/` so they survive repo moves.

## Adding a New Hook

The steps below apply to **PreToolUse hooks**. SessionStart hooks have different behavior: they receive no stdin, write informational output to stdout, and their exit code is ignored.

**PreToolUse hook steps:**

1. Create the script in `config/hooks/<name>.sh` — make it executable (`chmod +x`)
2. Read JSON from stdin: `input=$(cat)` then parse with `jq`
3. Exit 0 to allow the action, exit 2 to block with a message on stdout
4. Add an entry to `setup.sh`'s hook installation section
5. Document it in this file and in CLAUDE.md's `config/` directory comment
