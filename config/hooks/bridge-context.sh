#!/usr/bin/env bash
# SessionStart hook: Inject current repo's memory graph context
# Outputs recent decisions, topics, and tasks from the agentic-bridge to stdout.
# Silently no-ops if the bridge is unreachable or context is empty.
# Note: set -euo pipefail intentionally omitted — must always exit 0.

# Derive repo slug (same pattern used in skills)
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ -n "$REMOTE_URL" ]; then
  REPO_SLUG=$(echo "$REMOTE_URL" | sed 's|.*[:/]\([^/]*/[^/]*\)\.git$|\1|;s|.*[:/]\([^/]*/[^/]*\)$|\1|' | tr '/' '-')
else
  REPO_SLUG=$(basename "$(pwd)" 2>/dev/null || echo "unknown")
fi

# Check bridge health — silent exit if unreachable
if ! curl -sf --max-time 2 "http://localhost:3100/health" &>/dev/null; then
  exit 0
fi

# Query token-budgeted context from the memory graph
RESPONSE=$(curl -sf --max-time 5 \
  "http://localhost:3100/memory/context?query=recent+decisions+tasks+topics&repo=${REPO_SLUG}&max_tokens=800&agent=session-start" \
  2>/dev/null) || exit 0

# Validate response
OK=$(printf '%s\n' "$RESPONSE" | jq -r '.ok // false' 2>/dev/null) || exit 0
[ "$OK" != "true" ] && exit 0

# Format each section as [Heading] first-line-of-content
SECTIONS=$(printf '%s\n' "$RESPONSE" | \
  jq -r '.data.sections[]? | "[" + .heading + "] " + ((.content // "") | split("\n")[0])' \
  2>/dev/null) || exit 0
[ -z "$SECTIONS" ] && exit 0

echo "=== Project Memory ==="
printf '%s\n' "$SECTIONS"
