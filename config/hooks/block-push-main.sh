#!/usr/bin/env bash
set -euo pipefail

# PreToolUse hook: Block git push to main/master
# Exit 2 = deny, Exit 0 = allow.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$COMMAND" ] && exit 0

# Only check git push commands
echo "$COMMAND" | grep -qE '\bgit\s+push\b' || exit 0

# Check if pushing to main or master explicitly
if echo "$COMMAND" | grep -qE '\bgit\s+push\s+\S+\s+(main|master)\b'; then
  echo "BLOCKED: Pushing directly to main/master is not allowed."
  echo "Suggestion: Create a feature branch and open a pull request instead."
  exit 2
fi

# Check if pushing with current branch being main/master (bare git push or git push origin)
if echo "$COMMAND" | grep -qE '\bgit\s+push\s*$' || echo "$COMMAND" | grep -qE '\bgit\s+push\s+origin\s*$'; then
  CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
  if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    echo "BLOCKED: You are on '$CURRENT_BRANCH'. Pushing directly to main/master is not allowed."
    echo "Suggestion: Create a feature branch and open a pull request instead."
    exit 2
  fi
fi

exit 0
