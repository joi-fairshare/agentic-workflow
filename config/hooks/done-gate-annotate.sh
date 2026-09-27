#!/usr/bin/env bash
# aw:done-gate-annotate — PostToolUse hook on Agent (subagents/teammates).
# SubagentStop can't block (confirmed: it never even fires for a subagent —
# Probe gate item 2), so this hook only annotates the Agent tool result with
# whether the dispatch's own final message plausibly satisfies its brief's
# acceptance criteria. It never blocks or denies.
set -uo pipefail
[ -n "${AW_JUDGE_CHILD:-}" ] && exit 0

INPUT="$(cat 2>/dev/null || true)"
[ -n "$INPUT" ] || exit 0

TOOL_USE_ID="$(printf '%s' "$INPUT" | jq -r '.tool_use_id // empty')"
[ -n "$TOOL_USE_ID" ] || exit 0

BRIEF_JSON="$(judge brief get "$TOOL_USE_ID" 2>/dev/null || true)"
[ -n "$BRIEF_JSON" ] || exit 0

ACCEPTANCE="$(printf '%s' "$BRIEF_JSON" | jq -r '.acceptanceCriteria // empty')"
[ -n "$ACCEPTANCE" ] || exit 0

# The dispatch's own final message — tool_response is whatever shape the
# Agent tool returns; the real, generic text of interest is its `.result` or
# a plain string response. Read both shapes rather than assuming one.
FINAL_MESSAGE="$(printf '%s' "$INPUT" | jq -r '
  if (.tool_response | type) == "string" then .tool_response
  else (.tool_response.result // "")
  end
' 2>/dev/null)"

if [ -n "$FINAL_MESSAGE" ] && printf '%s' "$FINAL_MESSAGE" | grep -qiF "$(printf '%s' "$ACCEPTANCE" | cut -c1-40)"; then
  CONTEXT="Brief acceptance criteria plausibly met: \"$ACCEPTANCE\"."
else
  CONTEXT="Brief acceptance criteria NOT clearly addressed in the final message: \"$ACCEPTANCE\". Verify before treating this as done."
fi

jq -nc --arg c "$CONTEXT" '{hookSpecificOutput:{hookEventName:"PostToolUse", additionalContext:$c}}'
exit 0
