#!/usr/bin/env bash
# PreToolUse hook: Rewrite eligible commands to use rtk for token compression
# Reads tool input JSON from stdin. Always exits 0 (never blocks).
# If command matches a rewrite pattern, outputs JSON with updatedInput.
# Safety hooks run first — this runs 4th in the Bash chain after all safety checks.

INPUT=$(cat)
COMMAND=$(printf '%s\n' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || true
[ -z "$COMMAND" ] && exit 0

# Only rewrite if rtk is available
command -v rtk &>/dev/null || exit 0

REWRITTEN=""

# git status/log/diff/push/show → rtk git <sub> (full args preserved)
if printf '%s\n' "$COMMAND" | grep -qE '^git (status|log|diff|push|show)'; then
  REWRITTEN="rtk $COMMAND"

# vitest run → rtk vitest run (full args preserved)
elif printf '%s\n' "$COMMAND" | grep -qE '^vitest run'; then
  REWRITTEN="rtk $COMMAND"

# npm test → rtk npm test; npm run test → rtk npm test (args preserved)
elif printf '%s\n' "$COMMAND" | grep -qE '^npm (test|run test)'; then
  REST=$(printf '%s\n' "$COMMAND" | sed 's/^npm run test//' | sed 's/^npm test//')
  REWRITTEN="rtk npm test$REST"

# npx tsc / tsc → rtk tsc (args preserved, npx removed)
elif printf '%s\n' "$COMMAND" | grep -qE '^(npx )?tsc( |$)'; then
  REST=$(printf '%s\n' "$COMMAND" | sed 's/^npx tsc//' | sed 's/^tsc//')
  REWRITTEN="rtk tsc$REST"

# npx eslint / eslint → rtk lint (args preserved, npx removed)
elif printf '%s\n' "$COMMAND" | grep -qE '^(npx )?eslint( |$)'; then
  REST=$(printf '%s\n' "$COMMAND" | sed 's/^npx eslint//' | sed 's/^eslint//')
  REWRITTEN="rtk lint$REST"

# cargo test / cargo build → rtk cargo <sub> (full args preserved)
elif printf '%s\n' "$COMMAND" | grep -qE '^cargo (test|build)'; then
  REWRITTEN="rtk $COMMAND"

# next build → rtk next build (full args preserved)
elif printf '%s\n' "$COMMAND" | grep -qE '^next build'; then
  REWRITTEN="rtk $COMMAND"
fi

# If no rewrite matched, pass through unchanged
[ -z "$REWRITTEN" ] && exit 0

# Output updated input JSON for Claude Code to apply
printf '%s\n' "$REWRITTEN" | jq -R '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: {command: .}}}'
exit 0
