#!/usr/bin/env bash
# aw:scope-gate — PreToolUse hook on Agent (lever 3). Gates a dispatch on a
# real brief (goal + acceptance criteria + proof command) via `judge
# brief-scope`, saving an approved brief so the done gate (Task 2) and the
# SubagentStart mapping (subagent-start-map.sh) can find it later.
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

SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"')"
PROMPT_ID="$(printf '%s' "$INPUT" | jq -r '.prompt_id // "unknown"')"
TOOL_USE_ID="$(printf '%s' "$INPUT" | jq -r '.tool_use_id // empty')"
AGENT_TYPE="$(printf '%s' "$INPUT" | jq -r '.tool_input.subagent_type // empty')"
DISPATCH_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_input.name // empty')"
GOAL="$(printf '%s' "$INPUT" | jq -r '.tool_input.description // empty')"
PROMPT_TEXT="$(printf '%s' "$INPUT" | jq -r '.tool_input.prompt // empty')"
# Spec F13: a skill's own internal orchestration dispatch sets this true by
# convention on its own Agent call's tool_input — exempt the same way a
# read-only agent type is (brief-scope.ts's own pre-rule).
SKILL_INTERNAL="$(printf '%s' "$INPUT" | jq -r '.tool_input.skill_internal // false')"
[ -n "$TOOL_USE_ID" ] || allow

# The brief lives inside the dispatch's own prompt text, per convention: a
# goal and acceptance criteria the dispatcher wrote there. This hook doesn't
# invent a new authoring surface — it reads what's already in tool_input.
ACCEPTANCE="$PROMPT_TEXT"
PROOF_COMMAND="$PROMPT_TEXT"

JUDGE_INPUT="$(jq -nc --arg t "$AGENT_TYPE" --arg g "$GOAL" --arg a "$ACCEPTANCE" --arg p "$PROOF_COMMAND" --argjson si "$SKILL_INTERNAL" \
  '{agentType: $t, goal: $g, acceptanceCriteria: $a, proofCommand: $p, skillInternal: $si}')"
JUDGE_OUT="$(printf '%s' "$JUDGE_INPUT" | judge brief-scope 2>/dev/null)" || allow
DECISION="$(printf '%s' "$JUDGE_OUT" | jq -r '.decision // empty' 2>/dev/null)" || allow
[ -n "$DECISION" ] || allow

case "$DECISION" in
  ready)
    SAVE_INPUT="$(jq -nc \
      --arg tu "$TOOL_USE_ID" --arg s "$SESSION_ID" --arg p "$PROMPT_ID" \
      --arg dn "$DISPATCH_NAME" --arg st "$AGENT_TYPE" \
      --arg g "$GOAL" --arg a "$ACCEPTANCE" --arg pc "$PROOF_COMMAND" \
      '{toolUseId: $tu, sessionId: $s, promptId: $p, dispatchName: (if $dn == "" then null else $dn end), subagentType: $st, goal: $g, acceptanceCriteria: $a, proofCommand: $pc}')"
    printf '%s' "$SAVE_INPUT" | judge brief save > /dev/null 2>&1 || true
    allow
    ;;
  missing)
    deny "Dispatch brief is missing a goal or acceptance criteria — add both to the prompt before dispatching."
    ;;
  needs_design)
    deny "This dispatch needs a design decision first — send it to the user instead of dispatching."
    ;;
  *)
    allow
    ;;
esac
