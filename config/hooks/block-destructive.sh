#!/usr/bin/env bash
set -euo pipefail

# PreToolUse hook: Block destructive commands
# Reads tool input JSON from stdin. Exit 2 = deny, Exit 0 = allow.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$COMMAND" ] && exit 0

# rm -rf (flags containing both r and f in any order)
if echo "$COMMAND" | grep -qE '\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b'; then
  echo "BLOCKED: rm -rf is destructive and irreversible."
  echo "Suggestion: Use 'trash' or 'mv' to a backup location instead."
  exit 2
fi

# git reset --hard
if echo "$COMMAND" | grep -qE '\bgit\s+reset\s+--hard\b'; then
  echo "BLOCKED: git reset --hard discards all uncommitted changes."
  echo "Suggestion: Use 'git stash' to save changes, or 'git reset --soft' to unstage."
  exit 2
fi

# git push --force (but NOT --force-with-lease)
if echo "$COMMAND" | grep -qE '\bgit\s+push\s+.*--force\b' && \
   ! echo "$COMMAND" | grep -qE '\bgit\s+push\s+.*--force-with-lease\b'; then
  echo "BLOCKED: git push --force can overwrite remote history."
  echo "Suggestion: Use 'git push --force-with-lease' for safer force pushes, or create a PR."
  exit 2
fi

# git checkout . or git checkout -- .
if echo "$COMMAND" | grep -qE '\bgit\s+checkout\s+(--\s+)?\.'; then
  echo "BLOCKED: git checkout . discards all unstaged changes."
  echo "Suggestion: Use 'git stash' to save changes, or checkout specific files."
  exit 2
fi

# git clean -f (any flag combo containing f)
if echo "$COMMAND" | grep -qE '\bgit\s+clean\s+-[a-zA-Z]*f'; then
  echo "BLOCKED: git clean -f permanently deletes untracked files."
  echo "Suggestion: Use 'git clean -n' (dry run) first to preview what would be deleted."
  exit 2
fi

exit 0
