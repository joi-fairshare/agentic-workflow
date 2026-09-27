#!/usr/bin/env bash
# Scope gate (lever 3, Plan 5 Task 1): scope-gate.sh (PreToolUse/Agent) +
# subagent-start-map.sh (SubagentStart). Its own approval gate, in the style
# of install-wake-gating.sh — never folded into install-judge.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SETTINGS_FILE="${CLAUDE_SETTINGS_FILE:-$HOME/.claude/settings.json}"
HOOKS_DIR="${CLAUDE_HOOKS_DIR:-$HOME/.claude/hooks}"
JUDGE_BIN="${AW_JUDGE_BIN:-judge}"
# shellcheck source=../config/lib/merge-hook.sh
source "$ROOT/config/lib/merge-hook.sh"

if [ "${1:-}" = "--uninstall" ]; then
  merge_hook "$SETTINGS_FILE" PreToolUse aw:scope-gate null
  merge_hook "$SETTINGS_FILE" SubagentStart aw:subagent-start-map null
  echo "  scope-gate: hook entries removed from $SETTINGS_FILE"
  exit 0
fi

if ! command -v "$JUDGE_BIN" > /dev/null 2>&1; then
  echo "  scope-gate: refusing to install — judge is not installed (run scripts/install-judge.sh first, or set AW_JUDGE_BIN)" >&2
  exit 1
fi

mkdir -p "$HOOKS_DIR"

# timeout: 12s = brief-scope's own timeBudgetMs (10s, project rule for a
# claude-cli-routed question) + 2s margin, so Claude Code never kills this
# hook before `judge` itself can fail open on a slow/timed-out model call.
cp "$ROOT/config/hooks/scope-gate.sh" "$HOOKS_DIR/scope-gate.sh"
chmod +x "$HOOKS_DIR/scope-gate.sh"
SCOPE_ENTRY=$(jq -nc --arg c "$HOOKS_DIR/scope-gate.sh # aw:scope-gate" '{matcher:"Agent", hooks:[{type:"command",command:$c,timeout:12}]}')
merge_hook "$SETTINGS_FILE" PreToolUse aw:scope-gate "$SCOPE_ENTRY"

cp "$ROOT/config/hooks/subagent-start-map.sh" "$HOOKS_DIR/subagent-start-map.sh"
chmod +x "$HOOKS_DIR/subagent-start-map.sh"
MAP_ENTRY=$(jq -nc --arg c "$HOOKS_DIR/subagent-start-map.sh # aw:subagent-start-map" '{hooks:[{type:"command",command:$c}]}')
merge_hook "$SETTINGS_FILE" SubagentStart aw:subagent-start-map "$MAP_ENTRY"

echo "  scope-gate: scope-gate, subagent-start-map hooks installed (lever 3)"
