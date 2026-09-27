#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SETTINGS_FILE="${CLAUDE_SETTINGS_FILE:-$HOME/.claude/settings.json}"
HOOKS_DIR="${CLAUDE_HOOKS_DIR:-$HOME/.claude/hooks}"
STATE_DIR="${AW_STATE_DIR:-$HOME/.agentic-workflow}"
# shellcheck source=../config/lib/merge-hook.sh
source "$ROOT/config/lib/merge-hook.sh"

if [ "${1:-}" = "--uninstall" ]; then
  merge_hook "$SETTINGS_FILE" PostToolUse aw:context-guard null
  echo "  context-guard: hook entry removed from $SETTINGS_FILE"
  if [ -d "$STATE_DIR/context-guard" ]; then
    rm -r "$STATE_DIR/context-guard"
    echo "  context-guard: removed $STATE_DIR/context-guard"
  fi
  # README.md is the one file this installer owns in digests/ — remove it,
  # then remove the directory too only if nothing else (an actual digest) is
  # left in it. A fresh install always drops README.md there, so "empty"
  # has to be judged after removing what we ourselves put there, not before.
  if [ -f "$STATE_DIR/digests/README.md" ]; then
    rm "$STATE_DIR/digests/README.md"
  fi
  if [ -d "$STATE_DIR/digests" ] && [ -z "$(ls -A "$STATE_DIR/digests" 2>/dev/null)" ]; then
    rmdir "$STATE_DIR/digests"
    echo "  context-guard: removed empty $STATE_DIR/digests"
  elif [ -d "$STATE_DIR/digests" ]; then
    echo "  context-guard: left $STATE_DIR/digests in place (holds files)"
  fi
  exit 0
fi

mkdir -p "$STATE_DIR/digests" "$STATE_DIR/context-guard"
cp "$ROOT/config/digests-README.md" "$STATE_DIR/digests/README.md"

mkdir -p "$STATE_DIR/context-guard/state"
if [ ! -f "$STATE_DIR/context-guard/config.json" ]; then
  # growthGateBytes is NOT read from this file (latency fix, 2026-09-27 review
  # #2 — the hook's skip path reads env only, via
  # AW_CONTEXT_GUARD_GROWTH_GATE_BYTES, default 20000). Only thresholdTokens
  # is a config.json setting; keep the field out so nothing implies it's live.
  echo '{"thresholdTokens": 200000}' > "$STATE_DIR/context-guard/config.json"
  echo "  context-guard: default config installed at $STATE_DIR/context-guard/config.json"
else
  echo "  context-guard: existing config left untouched"
fi

mkdir -p "$HOOKS_DIR"
cp "$ROOT/config/hooks/context-guard.sh" "$HOOKS_DIR/context-guard.sh"
chmod +x "$HOOKS_DIR/context-guard.sh"

ENTRY="$(jq -nc --arg cmd "$HOOKS_DIR/context-guard.sh # aw:context-guard" '{matcher: ".*", hooks: [{type: "command", command: $cmd}]}')"
merge_hook "$SETTINGS_FILE" PostToolUse aw:context-guard "$ENTRY"
echo "  context-guard: hook installed (PostToolUse, every tool)"
