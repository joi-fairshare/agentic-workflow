#!/usr/bin/env bash
# Canonical repo-slug derivation + output-dir setup for all skills.
# Source at the top of EVERY body bash block that uses $REPO_SLUG —
# shell state does not persist between Bash tool calls.
# No `set -e` — safe to source repeatedly.

REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ -n "$REMOTE_URL" ]; then
  REPO_SLUG=$(echo "$REMOTE_URL" | sed 's|.*[:/]\([^/]*/[^/]*\)\.git$|\1|;s|.*[:/]\([^/]*/[^/]*\)$|\1|' | tr '/' '-')
else
  REPO_SLUG=$(basename "$(pwd)")
fi
AW_DIR="${AW_STATE_DIR:-$HOME/.agentic-workflow}/$REPO_SLUG"
mkdir -p "$AW_DIR"
export REPO_SLUG AW_DIR
