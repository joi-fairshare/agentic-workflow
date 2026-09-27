#!/usr/bin/env bash
# aw:probe — hook-input probe (cheap-agent-harness rollout step 0.5).
# Appends the raw hook input to $AW_PROBE_DIR/<event>.jsonl.
# Logging only: prints nothing and always exits 0, so it can never block work.
EVENT="${1:-unknown}"
DIR="${AW_PROBE_DIR:-${AW_STATE_DIR:-$HOME/.agentic-workflow}/probe}"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p "$DIR" 2>/dev/null || exit 0
INPUT="$(cat 2>/dev/null || true)"
[ -n "$INPUT" ] || INPUT=null
if ! printf '%s' "$INPUT" \
    | jq -c --arg ts "$TS" --arg ev "$EVENT" '{"ts": $ts, "event": $ev, "input": .}' \
    >> "$DIR/$EVENT.jsonl" 2>/dev/null; then
  printf '{"ts":"%s","event":"%s","input":null,"parse_error":true}\n' "$TS" "$EVENT" \
    >> "$DIR/$EVENT.jsonl" 2>/dev/null
fi
exit 0
