#!/usr/bin/env bash
# aw:external-write-guard — PreToolUse hook matching git push, gh
# pr create|merge|comment|review, Linear save_*/create_*/delete_*, and Slack
# send_* tools. Denies "needs the user" only when the current turn began with an
# auto-continue (Task 4's turn-state); allows otherwise. Deterministic
# pre-rules only — a model never decides this (repo-wide rule).
# Per RF-5: any tool call reaching this hook that isn't actually one of the
# matched external-write tools always allows — a matcher misconfiguration
# must never turn into a silent default-deny.
set -uo pipefail

if [ -n "${AW_JUDGE_CHILD:-}" ]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
  exit 0
fi

allow() {
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
  exit 0
}
deny() {
  jq -nc --arg r "$1" '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":$r}}'
  exit 0
}

INPUT="$(cat 2>/dev/null || true)"
[ -n "$INPUT" ] || allow

TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty')"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

is_matched_external_write() {
  case "$TOOL_NAME" in
    Bash)
      case "$COMMAND" in
        *"git push"*) return 0 ;;
        *"gh pr create"*|*"gh pr merge"*|*"gh pr comment"*|*"gh pr review"*) return 0 ;;
        *) return 1 ;;
      esac
      ;;
    mcp__claude_ai_Linear__save_*|mcp__claude_ai_Linear__create_*|mcp__claude_ai_Linear__delete_*) return 0 ;;
    mcp__claude_ai_Slack__slack_send_*) return 0 ;;
    *) return 1 ;;
  esac
}

# RF-5: only the exact matched set ever denies — everything else allows,
# even if this hook was mistakenly wired to a broader matcher.
is_matched_external_write || allow

SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // empty')"
SESSIONS_DIR="${AW_JUDGE_SESSIONS_DIR:-${AW_STATE_DIR:-$HOME/.agentic-workflow}/judge/sessions}"
SESSION_FILE="$SESSIONS_DIR/$SESSION_ID.json"

if [ -n "$SESSION_ID" ] && [ -f "$SESSION_FILE" ]; then
  AUTO_CONTINUED_AT="$(jq -r '.auto_continued_at // empty' "$SESSION_FILE" 2>/dev/null || true)"
  if [ -n "$AUTO_CONTINUED_AT" ]; then
    deny "This turn auto-continued without the user — external writes (push/merge/PR/Linear/Slack) need the user's own turn first."
  fi
fi

allow
