#!/usr/bin/env bash
# aw:record-teammate-name — PreToolUse hook on Agent. Always allows; records
# named dispatches (teammates) into a small lookup table this plan's own
# send-gate.sh and Plan 5's subagent-start-map.sh both consume.
set -uo pipefail
if [ -n "${AW_JUDGE_CHILD:-}" ]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
  exit 0
fi
INPUT="$(cat 2>/dev/null || true)"
TABLE="${AW_TEAMMATE_NAMES_FILE:-${AW_STATE_DIR:-$HOME/.agentic-workflow}/judge/teammate-names.jsonl}"
mkdir -p "$(dirname "$TABLE")"
if [ -n "$INPUT" ]; then
  NAME="$(printf '%s' "$INPUT" | jq -r '.tool_input.name // empty' 2>/dev/null)"
  SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)"
  if [ -n "$NAME" ]; then
    jq -nc --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg s "$SESSION_ID" --arg n "$NAME" '{ts:$ts, sessionId:$s, name:$n}' >> "$TABLE" 2>/dev/null || true
  fi
fi
echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
exit 0
