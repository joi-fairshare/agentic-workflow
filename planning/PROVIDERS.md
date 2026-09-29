# Providers

Agentic Workflow supports three agent hosts: **Claude Code**, **Codex**, and **Cursor**.
One canonical core (skills, hook logic, MCP servers, bridge, judge, scorer) plus a thin adapter per
provider. Skill text names capabilities, not tools — see `skills/_shared/capabilities.md`.

## Observed on this machine (2026-09-28)

| | Claude Code | Codex | Cursor |
|---|---|---|---|
| CLI | `claude` 2.1.284 | `codex` 0.158.0 | `cursor-agent` 2026.09.02 |
| Headless run | `claude -p` | `codex exec` | `cursor-agent -p` |
| User config | `~/.claude/settings.json` | `~/.codex/config.toml` | `~/.cursor/cli-config.json`, `~/.cursor/mcp.json` |
| Skills dir (user) | `~/.claude/skills/<name>/SKILL.md` | `~/.codex/skills/` (toolkit installs here; Codex also reads `~/.agents/skills/`, left alone because Cursor-owned dirs live there) | `~/.cursor/skills/` (toolkit installs here); also reads `~/.claude/skills`, `~/.codex/skills`, `~/.grok/skills`, `~/.agents/skills`, dedup by name |
| Custom agents | `~/.claude/agents/*.md` | `~/.codex/agents/<name>.toml` (`name`, `description`, `developer_instructions`; `model` omitted, Claude pin mapped to `model_reasoning_effort`) | `~/.cursor/agents/*.md` (real files; `model: fast\|inherit`, `readonly`) |
| Ask user | `AskUserQuestion` | `request_user_input` | `AskQuestion` |
| Subagents | `Agent` | `spawn_agent` / `wait_agent` / `send_message` (feature `multi_agent` stable) | `Task` |
| Hooks | `settings.json` `hooks` (PreToolUse, SessionStart, Stop, …); canonical scripts run directly | `~/.codex/hooks.json` via `adapters/codex.sh`; **trust required**: run `/hooks` in `codex` and trust the `aw:*` entries | `~/.cursor/hooks.json` (`beforeShellExecution`, `sessionStart`, `stop`, …) via `adapters/cursor.sh`; user hooks run from `~/.cursor/` (adapter cds to the workspace root); invalid hook JSON blocks (adapter always prints valid JSON) |
| MCP register | `claude mcp add --scope user` | `codex mcp add` | jq merge into `~/.cursor/mcp.json` `mcpServers`; new servers may need `cursor-agent mcp enable <name>` |
| Transcripts | `~/.claude/projects/<proj>/<session>.jsonl` | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | `~/.cursor/projects/<proj>/agent-transcripts/<id>/<id>.jsonl` |
| Repo instructions | `CLAUDE.md`, `.claude/rules/*.md` (`paths:` frontmatter) | `AGENTS.md` (nested) | `AGENTS.md`, `.cursor/rules/*.mdc` (`globs:`, `alwaysApply:`) |

Rows marked with paths or event names should be re-verified against each provider's docs/CLI before
relying on them; record corrections here.

## Canonical layout

| Concern | Canonical | Emitted per provider |
|---------|-----------|----------------------|
| Skills | `skills/<name>/SKILL.md` | Symlinked into each installed provider's skills dir |
| Shared fragments | `skills/_shared/` via `$HOME/.agentic-workflow/toolkit` | — |
| Provider registry | `$HOME/.agentic-workflow/providers` (`<name> <skills-dir>` per line) | Written by `setup.sh` |
| Repo instructions | `AGENTS.md` | `CLAUDE.md` → symlink to `AGENTS.md` |
| Scoped rules | `.agents/rules/<name>.md` — the only copy (frontmatter `description`, `globs`, `paths` (same list), `alwaysApply`) | `.claude/rules` → dir symlink; `.cursor/rules/<name>.mdc` → per-file symlinks; Rules Index table in `AGENTS.md` (all via `scripts/sync-rules.sh`) |
| Hooks | `config/hooks/*.sh` (Claude protocol: JSON stdin, exit 2 = deny) | Claude: run directly. Codex/Cursor: `config/hooks/adapters/{codex,cursor}.sh` (export `AW_PROVIDER`); mapping in `config/hooks/adapters/README.md` |
| Installer | `setup.sh --providers claude,codex,cursor [--dry-run]` (default: detect installed CLIs) | `providers/<name>/install.sh` + `install-hooks.sh`; levers via `scripts/install-*.sh --provider <name>` |
| Judge | `judge/src/providers/` | `claude-cli`, `codex-cli`, `cursor-cli` (+ `rules`, `jev`) |
| Scorer | `scorer/src/transcript/` | One transcript source per provider (`--provider claude\|codex\|cursor\|all`) |

## Notes

**AW_PROVIDER.** The Codex and Cursor hook adapters export `AW_PROVIDER=codex|cursor` so
canonical hooks, and the `judge` they call, know the host. Unset means Claude Code.

**Judge chain.** Agent CLIs come from `providers.agentClis` in `~/.agentic-workflow/judge/config.json`
if set. Otherwise the order is `claude-cli`, `codex-cli`, `cursor-cli`, with the `AW_PROVIDER` host
moved to the front. Only CLIs on `PATH` (`claude`, `codex`, `cursor-agent`) are used, and any one of
them is enough. Text classes run `jev` (unless disabled) → agent CLIs → `rules`. Image classes run
agent CLIs → `rules`.

```json
{ "providers": { "agentClis": ["codex-cli", "claude-cli"], "jev": false } }
```

Cursor's CLI is slow (~8–13s per call), so on Cursor-only machines text questions often time out
and fall through to `rules`.

**Scorer.** `scorer --provider claude|codex|cursor|all` (comma-separated is fine). By default it
reads every provider whose transcript dir exists. Override the dirs with `--projects-dir`,
`--codex-dir`, and `--cursor-dir`. The report has a "By provider" section. Cursor data is
involvement-only because its transcripts carry no token or cost data. Codex rollouts that were
imported from Claude (listed in `~/.codex/external_agent_session_imports.json`) are skipped so they
aren't counted twice.
