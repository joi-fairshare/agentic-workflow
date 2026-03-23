#!/usr/bin/env bash

# SessionStart hook: Inject recent git context
# Outputs context to stdout for Claude to see.

echo "=== Git Context ==="

BRANCH=$(git branch --show-current 2>/dev/null || echo "(detached)")
echo "Branch: $BRANCH"

echo ""
echo "Recent commits:"
git log --oneline -5 2>/dev/null || echo "(no commits)"

echo ""
echo "Working tree status:"
git status --short 2>/dev/null || echo "(not a git repo)"
