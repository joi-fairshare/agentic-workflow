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

## SessionStart Hooks

| Hook | Outputs |
|------|---------|
| `git-context.sh` | Current branch, last 5 commits, working tree status |

Hook protocol: scripts read JSON from stdin (`{"tool_name": "...", "tool_input": {...}}`), exit 0 to allow, exit 2 to deny with message on stdout.

## Hook Files

All hook scripts live in `config/hooks/`:

| File | Type | Matcher |
|------|------|---------|
| `block-destructive.sh` | PreToolUse | `Bash` |
| `block-push-main.sh` | PreToolUse | `Bash` |
| `detect-secrets.sh` | PreToolUse | `Bash` |
| `git-context.sh` | SessionStart | — |

`setup.sh` installs them by copying (not symlinking) to `~/.claude/hooks/` so they survive repo moves.

## Adding a New Hook

1. Create the script in `config/hooks/<name>.sh` — make it executable (`chmod +x`)
2. Read JSON from stdin: `input=$(cat)` then parse with `jq`
3. Exit 0 to allow the action, exit 2 to block with a message on stdout
4. Add an entry to `setup.sh`'s hook installation section
5. Document it in this file and in CLAUDE.md's `config/` directory comment
