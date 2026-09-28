---
description: Safety and context hooks — per-provider adapters, protocols, installation
globs:
  - "config/hooks/**"
  - "config/settings.json"
paths:
  - "config/hooks/**"
  - "config/settings.json"
alwaysApply: false
---

# Hooks Rules

Safety hooks run automatically via each provider's hook system (Claude Code, Codex, Cursor). Hook logic is written once in `config/hooks/*.sh` against the Claude Code protocol (JSON on stdin, exit 2 = deny). Claude Code runs those scripts directly; for Codex and Cursor an adapter translates the host's hook I/O to that protocol. The full event mapping (including unmapped levers) is in `config/hooks/adapters/README.md`.

## Per-Provider Adapters

| Provider | Hook config | Adapter | Installer |
|----------|-------------|---------|-----------|
| Claude Code | `~/.claude/settings.json` `hooks` (`PreToolUse`, `SessionStart`, …) | none — canonical scripts run directly from `~/.claude/hooks/` | `providers/claude/install-hooks.sh` |
| Codex | `~/.codex/hooks.json` | `config/hooks/adapters/codex.sh` | `providers/codex/install-hooks.sh` |
| Cursor | `~/.cursor/hooks.json` (`beforeShellExecution`, `sessionStart`, `stop`, …) | `config/hooks/adapters/cursor.sh` | `providers/cursor/install-hooks.sh` |

An adapter reads the host's stdin, normalizes it to `{"tool_name": "...", "tool_input": {...}}`, `cd`s to the session's working directory, exports `AW_PROVIDER=codex|cursor`, runs the canonical hook, and maps its exit code/stdout back to the host's allow/deny response. `config/hooks/adapters/common.sh` holds shared parsing; `install-lib.sh` holds the install helpers (`aw_hooks_init`, `aw_hooks_stage`, `aw_hook_set`, `aw_hook_unset`).

Put provider-specific parsing in the adapter, not the canonical hook. The one exception is data the adapter can't provide from stdin. For example, `context-guard.sh` falls back to Codex rollout `token_count` lines when the transcript has no Claude `assistant` line, and `done-gate.sh` falls back to `last_assistant_message`. Such fallbacks must leave Claude Code behavior unchanged. List every one of them in the adapters README.

`setup.sh` runs `providers/<name>/install-hooks.sh` for each selected provider, then the lever installers (see `planning/PROVIDERS.md`).

**Provider facts:**
- **Codex** only runs hooks you have trusted. After installing, open `codex`, run `/hooks`, and trust the `aw:*` entries. Re-trust after a reinstall that changes a command.
- **Cursor** runs user hooks from `~/.cursor/`, so the adapter `cd`s to `cwd` → `workspace_roots[0]` → `$CURSOR_PROJECT_DIR`. Cursor blocks the action when a hook returns invalid or missing JSON, so the adapter always prints valid JSON and falls back to `allow` on its own errors.
- Codex and Cursor copies of the scripts go to `~/.agentic-workflow/hooks/` (with `adapters/` and `lib/locks.sh`). Every entry ends in `# aw:<id>`, and `config/lib/merge-hook.sh` only touches entries carrying its own tag.

## PreToolUse Hooks (matcher: `Bash`; Cursor: `beforeShellExecution`)

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
| `prism-context.sh` | One-line warning if prism-mcp dashboard at `PRISM_DASHBOARD_PORT` (default 7180) is unreachable; silent on success |

`providers/claude/install-hooks.sh` also removes the SessionStart entry and `~/.claude/hooks/` copy of the retired `bridge-context.sh` hook left by older installs.

## Hook Protocols

**PreToolUse protocol:**
- Scripts read JSON from stdin: `{"tool_name": "...", "tool_input": {...}}`
- Exit 0 = allow the tool call to proceed
- Exit 2 = deny with a message on stdout explaining why

**SessionStart protocol:**
- No stdin input — scripts receive no data from the host (adapters discard any provider payload)
- Output context or information to stdout (the host injects it at session start)
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
| `prism-context.sh` | SessionStart | — |

Each provider's `install-hooks.sh` installs them by copying, not symlinking, so they survive repo moves. Claude Code's copies go to `~/.claude/hooks/`, and Codex and Cursor copies go to `~/.agentic-workflow/hooks/`. The script then registers the command in that provider's hook config, wrapped by the adapter for Codex and Cursor.

**Lever hooks** (context-guard, done-gate, scope-gate, external-write-guard, wake gating, judge-health) are installed by `scripts/install-*.sh --provider claude|codex|cursor`, with `claude` as the default. `setup.sh` runs them for each selected provider. A lever with no equivalent event on a provider prints `skipped for <provider>` and writes nothing. For example, context-guard is skipped on Cursor.

Tests (all run under a temp `HOME`): `config/hooks/tests/{codex-adapter,cursor-adapter,provider-install-hooks,probe-log,judge-health}.test.sh`.

## Adding a New Hook

The steps below apply to **PreToolUse hooks**. SessionStart hooks have different behavior: they receive no stdin, write informational output to stdout, and their exit code is ignored.

**PreToolUse hook steps:**

1. Create the script in `config/hooks/<name>.sh` — make it executable (`chmod +x`)
2. Read JSON from stdin: `input=$(cat)` then parse with `jq`
3. Exit 0 to allow the action, exit 2 to block with a message on stdout
4. Register it in each `providers/<name>/install-hooks.sh` (or a `scripts/install-*.sh --provider` lever installer) via `aw_hook_set`; skip providers whose hook system lacks the event and record it in the `config/hooks/adapters/README.md` mapping table
5. Document it in this file and in AGENTS.md's `config/` directory comment

## Probe Hook (cheap-agent-harness rollout step 0.5)

`probe-log.sh <Event>` appends raw hook stdin to `~/.agentic-workflow/probe/<Event>.jsonl`. It prints nothing and always exits 0. `scripts/probe.sh on|off|status` installs and removes it on `UserPromptSubmit`, `Stop`, `SubagentStop`, `TeammateIdle`, `SubagentStart`, and `PreToolUse`/`PostToolUse` (matcher `Agent|SendMessage`). Every probe command ends in `# aw:probe`, and `config/lib/merge-hook.sh` only ever touches commands with its own tag. `scorer probe` summarizes the logs. `scripts/probe.sh --provider codex|cursor on|off|status` installs the Codex/Cursor equivalents (no TeammateIdle; Cursor entries use the adapter's `--raw` mode) and logs to `probe/<provider>/`.
