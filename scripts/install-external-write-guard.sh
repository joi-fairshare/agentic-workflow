#!/usr/bin/env bash
# External-write guard (Plan 5 Task 3) + turn-origin lifecycle (Task 4):
# external-write-guard.sh (PreToolUse, matched external-write tools) +
# turn-origin.sh (UserPromptSubmit). Its own approval gate, in the style of
# install-wake-gating.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SETTINGS_FILE="${CLAUDE_SETTINGS_FILE:-$HOME/.claude/settings.json}"
HOOKS_DIR="${CLAUDE_HOOKS_DIR:-$HOME/.claude/hooks}"
JUDGE_BIN="${AW_JUDGE_BIN:-judge}"
# shellcheck source=../config/lib/merge-hook.sh
source "$ROOT/config/lib/merge-hook.sh"

if [ "${1:-}" = "--uninstall" ]; then
  merge_hook "$SETTINGS_FILE" PreToolUse aw:external-write-guard null
  merge_hook "$SETTINGS_FILE" UserPromptSubmit aw:turn-origin null
  echo "  external-write-guard: hook entries removed from $SETTINGS_FILE"
  exit 0
fi

if ! command -v "$JUDGE_BIN" > /dev/null 2>&1; then
  echo "  external-write-guard: refusing to install — judge is not installed (run scripts/install-judge.sh first, or set AW_JUDGE_BIN)" >&2
  exit 1
fi

mkdir -p "$HOOKS_DIR"

cp "$ROOT/config/hooks/external-write-guard.sh" "$HOOKS_DIR/external-write-guard.sh"
chmod +x "$HOOKS_DIR/external-write-guard.sh"
GUARD_ENTRY=$(jq -nc --arg c "$HOOKS_DIR/external-write-guard.sh # aw:external-write-guard" '{matcher:".*", hooks:[{type:"command",command:$c}]}')
merge_hook "$SETTINGS_FILE" PreToolUse aw:external-write-guard "$GUARD_ENTRY"

cp "$ROOT/config/hooks/turn-origin.sh" "$HOOKS_DIR/turn-origin.sh"
chmod +x "$HOOKS_DIR/turn-origin.sh"
ORIGIN_ENTRY=$(jq -nc --arg c "$HOOKS_DIR/turn-origin.sh # aw:turn-origin" '{hooks:[{type:"command",command:$c}]}')
merge_hook "$SETTINGS_FILE" UserPromptSubmit aw:turn-origin "$ORIGIN_ENTRY"

echo "  external-write-guard: external-write-guard (PreToolUse), turn-origin (UserPromptSubmit) hooks installed"
