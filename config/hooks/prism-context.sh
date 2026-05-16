#!/usr/bin/env bash
# SessionStart hook: warn if prism-mcp dashboard is unreachable.
# Silent on success; prints one warning line on failure.
# Per `.claude/rules/hooks.md`, SessionStart hooks receive no stdin, write to
# stdout, and their exit code is ignored.

PORT="${PRISM_DASHBOARD_PORT:-7180}"
if ! curl -fsS --max-time 2 "http://localhost:$PORT/health" >/dev/null 2>&1; then
  echo "⚠ prism-mcp dashboard unreachable at :$PORT — run /prismStatus for details"
fi
exit 0
