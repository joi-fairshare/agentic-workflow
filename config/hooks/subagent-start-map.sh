#!/usr/bin/env bash
# aw:subagent-start-map — SubagentStart hook. Maps the new agent_id to its
# saved brief: exact match by teammate name when SubagentStart.agent_type
# names a known teammate (Plan 4's teammate-name table); otherwise the
# documented (session_id, prompt_id, subagent_type) dispatch-order heuristic
# for an unnamed one-shot subagent.
set -uo pipefail
[ -n "${AW_JUDGE_CHILD:-}" ] && exit 0
INPUT="$(cat 2>/dev/null || true)"
[ -n "$INPUT" ] || exit 0

AGENT_ID="$(printf '%s' "$INPUT" | jq -r '.agent_id // empty')"
AGENT_TYPE="$(printf '%s' "$INPUT" | jq -r '.agent_type // empty')"
SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // empty')"
PROMPT_ID="$(printf '%s' "$INPUT" | jq -r '.prompt_id // empty')"
[ -n "$AGENT_ID" ] && [ -n "$AGENT_TYPE" ] || exit 0

TEAMMATE_NAMES="${AW_TEAMMATE_NAMES_FILE:-${AW_STATE_DIR:-$HOME/.agentic-workflow}/judge/teammate-names.jsonl}"
IS_TEAMMATE=0
if [ -f "$TEAMMATE_NAMES" ] && jq -e --arg n "$AGENT_TYPE" 'select(.name == $n)' "$TEAMMATE_NAMES" > /dev/null 2>&1; then
  IS_TEAMMATE=1
fi

if [ "$IS_TEAMMATE" -eq 1 ]; then
  TOOL_USE_ID="$(judge brief map-by-name "$AGENT_TYPE" 2>/dev/null)"
else
  TOOL_USE_ID="$(judge brief map-by-dispatch "$SESSION_ID" "$PROMPT_ID" "$AGENT_TYPE" 2>/dev/null)"
fi
[ -n "$TOOL_USE_ID" ] || exit 0
judge brief set-agent-id "$TOOL_USE_ID" "$AGENT_ID" 2>/dev/null || true
exit 0
