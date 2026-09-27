#!/usr/bin/env bash
# Turns the hook-input probe (cheap-agent-harness rollout step 0.5) on or off.
# Usage: scripts/probe.sh on|off|status
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SETTINGS_FILE="${CLAUDE_SETTINGS_FILE:-$HOME/.claude/settings.json}"
HOOKS_DIR="${CLAUDE_HOOKS_DIR:-$HOME/.claude/hooks}"
# shellcheck source=../config/lib/merge-hook.sh
source "$ROOT/config/lib/merge-hook.sh"

PLAIN_EVENTS=(UserPromptSubmit Stop SubagentStop TeammateIdle SubagentStart)
TOOL_EVENTS=(PreToolUse PostToolUse)
TOOL_MATCHER='Agent|SendMessage'

entry() {
  local hook_path="~/.claude/hooks/probe-log.sh"
  if [ -n "${CLAUDE_HOOKS_DIR:-}" ]; then
    hook_path="$HOOKS_DIR/probe-log.sh"
  fi
  local cmd="$hook_path $1 # aw:probe"
  if [ -n "${2:-}" ]; then
    jq -nc --arg c "$cmd" --arg m "$2" '{matcher: $m, hooks: [{type: "command", command: $c}]}'
  else
    jq -nc --arg c "$cmd" '{hooks: [{type: "command", command: $c}]}'
  fi
}

# backup_settings / restore_settings: make on/off transactional across their
# several merge_hook calls, so a failure partway through (e.g. jq breaking)
# never leaves settings.json half-installed.
BACKUP=""
backup_settings() {
  BACKUP=""
  if [ -f "$SETTINGS_FILE" ]; then
    BACKUP="$(mktemp "$(dirname "$SETTINGS_FILE")/.$(basename "$SETTINGS_FILE").probe-backup.XXXXXX")"
    cp "$SETTINGS_FILE" "$BACKUP"
  fi
}
restore_settings() {
  if [ -n "$BACKUP" ]; then
    mv "$BACKUP" "$SETTINGS_FILE"
  else
    rm -f "$SETTINGS_FILE"
  fi
}
drop_backup() {
  [ -n "$BACKUP" ] && rm -f "$BACKUP"
  BACKUP=""
}

case "${1:-}" in
  on)
    mkdir -p "$HOOKS_DIR"
    cp "$ROOT/config/hooks/probe-log.sh" "$HOOKS_DIR/probe-log.sh"
    chmod +x "$HOOKS_DIR/probe-log.sh"
    backup_settings
    ok=1
    for e in "${PLAIN_EVENTS[@]}"; do merge_hook "$SETTINGS_FILE" "$e" aw:probe "$(entry "$e")" || { ok=0; break; }; done
    if [ "$ok" -eq 1 ]; then
      for e in "${TOOL_EVENTS[@]}"; do merge_hook "$SETTINGS_FILE" "$e" aw:probe "$(entry "$e" "$TOOL_MATCHER")" || { ok=0; break; }; done
    fi
    if [ "$ok" -ne 1 ]; then
      restore_settings
      echo "probe: failed, settings.json restored" >&2
      exit 1
    fi
    drop_backup
    echo "probe: on. Logs go to ~/.agentic-workflow/probe/."
    echo "Leave it on for one working day, then run: scripts/probe.sh off && scorer probe"
    ;;
  off)
    backup_settings
    ok=1
    for e in "${PLAIN_EVENTS[@]}" "${TOOL_EVENTS[@]}"; do merge_hook "$SETTINGS_FILE" "$e" aw:probe null || { ok=0; break; }; done
    if [ "$ok" -ne 1 ]; then
      restore_settings
      echo "probe: failed, settings.json restored" >&2
      exit 1
    fi
    drop_backup
    echo "probe: off. Logs are kept in ~/.agentic-workflow/probe/."
    ;;
  status)
    if hook_owners "$SETTINGS_FILE" | awk -F'\t' '$3=="aw:probe"{found=1; print $1} END{exit !found}'; then :; else echo "probe: off"; fi
    ;;
  *)
    echo "usage: scripts/probe.sh on|off|status" >&2
    exit 1
    ;;
esac
