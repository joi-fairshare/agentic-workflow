#!/usr/bin/env bash
# Cursor base hooks: safety beforeShellExecution chain, rtk rewrite
# (preToolUse/Shell updated_input), and sessionStart context — the Cursor
# equivalent of providers/claude/install-hooks.sh.
#
# Scripts are copied to a provider-neutral dir (~/.agentic-workflow/hooks/)
# and every entry in ~/.cursor/hooks.json runs through
# config/hooks/adapters/cursor.sh. Each entry's command ends in "# aw:<id>";
# reinstall/uninstall only ever touch those. Lever hooks stay in
# scripts/install-*.sh --provider cursor.
#
# Usage: providers/cursor/install-hooks.sh [--uninstall]
# Env:   CURSOR_HOOKS_FILE (default ~/.cursor/hooks.json)
#        AW_HOOKS_DIR      (default ${AW_STATE_DIR:-~/.agentic-workflow}/hooks)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../../config/hooks/adapters/install-lib.sh
source "$ROOT/config/hooks/adapters/install-lib.sh"
aw_hooks_init cursor

SAFETY_IDS="aw:block-destructive aw:block-push-main aw:detect-secrets"
CONTEXT_IDS="aw:git-context aw:prism-context"

if [ "${1:-}" = "--uninstall" ]; then
  for id in $SAFETY_IDS; do aw_hook_unset beforeShellExecution "$id"; done
  aw_hook_unset preToolUse aw:rtk-rewrite
  for id in $CONTEXT_IDS; do aw_hook_unset sessionStart "$id"; done
  echo "  cursor hooks: safety + sessionStart entries removed from $AW_HOOKS_CONFIG"
  exit 0
fi

if [ "${AW_DRY_RUN:-0}" = "1" ]; then
  echo "  [dry-run] would copy hooks to $AW_HOOKS_INSTALL_DIR and merge aw:* entries into $AW_HOOKS_CONFIG"
  exit 0
fi

echo ""
echo "Installing Cursor hooks..."
aw_hooks_stage
echo "  hooks: copied to $AW_HOOKS_INSTALL_DIR (adapter: adapters/cursor.sh)"

aw_hook_set beforeShellExecution aw:block-destructive block-destructive.sh
aw_hook_set beforeShellExecution aw:block-push-main block-push-main.sh
aw_hook_set beforeShellExecution aw:detect-secrets detect-secrets.sh
echo "  beforeShellExecution: block-destructive, block-push-main, detect-secrets"

# Rewrites need preToolUse (beforeShellExecution can only allow/deny/ask).
aw_hook_set preToolUse aw:rtk-rewrite rtk-rewrite.sh Shell
echo "  preToolUse(Shell): rtk-rewrite"

aw_hook_set sessionStart aw:git-context git-context.sh
aw_hook_set sessionStart aw:prism-context prism-context.sh
echo "  sessionStart: git-context, prism-context"

echo "  hooks by owner:"
hook_owners "$AW_HOOKS_CONFIG" | awk -F'\t' '{printf "    %-22s %-22s %s\n", $1, $3, $2}'
