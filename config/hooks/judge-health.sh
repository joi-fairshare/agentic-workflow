#!/usr/bin/env bash
# aw:judge-health — SessionStart hook. Warns (but always exits 0 — fails open,
# spec: "Hooks fail open, but failures are loud") when `judge health` reports
# degraded, or when judge isn't installed at all.
[ -n "${AW_JUDGE_CHILD:-}" ] && exit 0
if ! command -v judge &>/dev/null; then
  echo "judge: not found on PATH"
  exit 0
fi
OUT="$(judge health 2>/dev/null)" || { echo "judge: health check failed"; exit 0; }
STATUS="$(echo "$OUT" | jq -r '.status // "unknown"' 2>/dev/null)"
FAILURES="$(echo "$OUT" | jq -r '.failures24h // 0' 2>/dev/null)"
if [ "$STATUS" = "degraded" ]; then
  echo "judge: degraded — ${FAILURES} failures in the last 24h. Run: judge health"
fi
exit 0
