#!/usr/bin/env bash
# aw:outbox-flush — TeammateIdle hook (lever 1A). Exit 2 keeps a teammate
# working when it still has its own queued progress to send; exit 0 lets it
# go idle otherwise. Scoped by teammate_name == the queued item's agentType
# (confirmed field correspondence, 2026-09-27 probe) — not a fallback.
set -uo pipefail
[ -n "${AW_JUDGE_CHILD:-}" ] && exit 0

INPUT="$(cat 2>/dev/null || true)"
[ -n "$INPUT" ] || exit 0

SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // empty')"
TEAMMATE_NAME="$(printf '%s' "$INPUT" | jq -r '.teammate_name // empty')"
[ -n "$SESSION_ID" ] || exit 0

OUTBOX_DIR="${AW_OUTBOX_DIR:-${AW_STATE_DIR:-$HOME/.agentic-workflow}/judge/outbox}"
OUTBOX_FILE="$OUTBOX_DIR/$SESSION_ID.jsonl"
[ -f "$OUTBOX_FILE" ] || exit 0
[ -s "$OUTBOX_FILE" ] || exit 0

if [ -n "$TEAMMATE_NAME" ]; then
  MATCH="$(jq -r --arg n "$TEAMMATE_NAME" 'select(.agentType == $n or .agentType == null)' "$OUTBOX_FILE" 2>/dev/null)"
  [ -n "$MATCH" ] || exit 0
fi

echo "Send your queued progress as one message now before going idle." >&2
exit 2
