#!/usr/bin/env bash
# aw:send-gate — PreToolUse hook on SendMessage (lever 1A). Classifies every
# outgoing message via `judge wake-gate` and allows, denies-and-queues, or
# denies-as-pure-ack. Fails open to allow on any judge failure (RF-1).
set -uo pipefail
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Installed layout first (scripts/install-wake-gating.sh copies locks.sh to
# $HOOKS_DIR/lib/locks.sh alongside this script), then a raw repo-checkout
# layout (config/hooks/send-gate.sh next to config/lib/locks.sh) — a bare
# `cp` of this script alone, with neither sibling present, used to silently
# disable the whole outbox-queue/digest mechanism with no error at all
# (2026-09-27 finding); this must never happen quietly again.
if [ -f "$HOOK_DIR/lib/locks.sh" ]; then
  LOCKS_LIB="$HOOK_DIR/lib/locks.sh"
elif [ -f "$HOOK_DIR/../lib/locks.sh" ]; then
  LOCKS_LIB="$HOOK_DIR/../lib/locks.sh"
else
  LOCKS_LIB=""
fi
# shellcheck source=../lib/locks.sh — owned by Plan 6, Task 1; sourced only.
[ -n "$LOCKS_LIB" ] && source "$LOCKS_LIB" 2>/dev/null

if [ -z "$LOCKS_LIB" ] || ! command -v acquire_lock > /dev/null 2>&1; then
  # Loud fail-open: never again let a missing/broken locks.sh silently skip
  # the outbox mechanism. Allow the message through (RF-1's spirit — never
  # block a real send on our own plumbing being broken) but say so loudly,
  # via systemMessage, so it's visible in the transcript instead of a quiet
  # no-op. Recording a judge failure isn't done here: there's no CLI surface
  # for it — judge/src/db.ts's `failures` table is only ever written from
  # inside evaluate()'s own provider-failure path, not from a plain shell
  # hook — so it's skipped rather than faked.
  jq -nc '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"},"systemMessage":"send-gate: locks.sh missing, wake gating disabled"}'
  exit 0
fi

if [ -n "${AW_JUDGE_CHILD:-}" ]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
  exit 0
fi

allow() {
  local msg="${1:-}"
  if [ -n "$msg" ]; then
    jq -nc --arg m "$msg" '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":{"message":$m}}}'
  else
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
  fi
  exit 0
}
deny() {
  jq -nc --arg r "$1" '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":$r}}'
  exit 0
}

INPUT="$(cat 2>/dev/null || true)"
[ -n "$INPUT" ] || allow

SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"')"
AGENT_TYPE="$(printf '%s' "$INPUT" | jq -r '.agent_type // empty')"
MESSAGE="$(printf '%s' "$INPUT" | jq -r '.tool_input.message // empty')"
[ -n "$MESSAGE" ] || allow

# BLOCKER fix (Step 2, F6): a control message (shutdown_request,
# shutdown_response, ...) is never routed through the classifier —
# deterministic, checked before senderKind derivation or any judge call.
TOOL_INPUT_TYPE="$(printf '%s' "$INPUT" | jq -r '.tool_input.type // "message"')"
[ "$TOOL_INPUT_TYPE" = "message" ] || allow

# senderKind (Probe gate item 4): agent_type absent -> main; agent_type found
# in the teammate-name table -> teammate; otherwise -> subagent.
TEAMMATE_NAMES="${AW_TEAMMATE_NAMES_FILE:-${AW_STATE_DIR:-$HOME/.agentic-workflow}/judge/teammate-names.jsonl}"
SENDER_KIND="main"
if [ -n "$AGENT_TYPE" ]; then
  SENDER_KIND="subagent"
  if [ -f "$TEAMMATE_NAMES" ] && jq -e --arg n "$AGENT_TYPE" 'select(.name == $n)' "$TEAMMATE_NAMES" > /dev/null 2>&1; then
    SENDER_KIND="teammate"
  fi
fi

OUTBOX_DIR="${AW_OUTBOX_DIR:-${AW_STATE_DIR:-$HOME/.agentic-workflow}/judge/outbox}"
mkdir -p "$OUTBOX_DIR"
OUTBOX_FILE="$OUTBOX_DIR/$SESSION_ID.jsonl"
LOCK_DIR="$OUTBOX_FILE.lock"

JUDGE_INPUT="$(jq -nc --arg text "$MESSAGE" --arg sk "$SENDER_KIND" '{text: $text, senderKind: $sk}')"
JUDGE_OUT="$(printf '%s' "$JUDGE_INPUT" | judge wake-gate 2>/dev/null)" || allow
DECISION="$(printf '%s' "$JUDGE_OUT" | jq -r '.decision // empty' 2>/dev/null)" || allow
[ -n "$DECISION" ] || allow

case "$DECISION" in
  send)
    # RF-4: mkdir-based lock around the read-then-truncate (no flock on macOS).
    if acquire_lock "$LOCK_DIR" 5; then
      if [ -s "$OUTBOX_FILE" ]; then
        NOW_EPOCH="$(date -u +%s)"
        CUTOFF_EPOCH=$((NOW_EPOCH - 7200))
        FRESH="$(jq -c --argjson cutoff "$CUTOFF_EPOCH" 'select((.ts | fromdateiso8601) >= $cutoff)' "$OUTBOX_FILE" 2>/dev/null)"
        jq -c --argjson cutoff "$CUTOFF_EPOCH" 'select((.ts | fromdateiso8601) < $cutoff)' "$OUTBOX_FILE" 2>/dev/null >> "$OUTBOX_DIR/expired.jsonl" || true
        : > "$OUTBOX_FILE"
        release_lock "$LOCK_DIR"
        if [ -n "$FRESH" ]; then
          DIGEST="$(printf '%s\n' "$FRESH" | jq -r '.text' | paste -sd'; ' -)"
          allow "$MESSAGE

[queued progress, now attached]: $DIGEST"
        fi
      else
        release_lock "$LOCK_DIR"
      fi
    fi
    allow
    ;;
  drop)
    deny "This was a pure ack with nothing to act on — don't send it."
    ;;
  batch|*)
    if acquire_lock "$LOCK_DIR" 5; then
      jq -nc --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg agent "$AGENT_TYPE" --arg text "$MESSAGE" \
        '{ts: $ts, agentType: (if $agent == "" then null else $agent end), text: $text}' >> "$OUTBOX_FILE"
      release_lock "$LOCK_DIR"
    fi
    deny "Queued: this reads as progress with nothing to act on yet. It'll ride along on your next real send, or flush automatically before you go idle."
    ;;
esac
