#!/usr/bin/env bash
# Build judge and install the ~/.local/bin/judge CLI wrapper.
#
# Split out of setup.sh so it can be run on its own, matching install-scorer.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
JUDGE_DIR="$SCRIPT_DIR/judge"

echo ""
echo "Installing judge..."

if [ -f "$JUDGE_DIR/package.json" ]; then
  (cd "$JUDGE_DIR" && npm install && npm run build)
  BIN_DIR="${CLAUDE_LOCAL_BIN:-$HOME/.local/bin}"
  mkdir -p "$BIN_DIR" "${AW_STATE_DIR:-$HOME/.agentic-workflow}/judge"
  cat > "$BIN_DIR/judge" <<EOF
#!/usr/bin/env bash
exec node "$JUDGE_DIR/dist/cli.js" "\$@"
EOF
  chmod +x "$BIN_DIR/judge"
  echo "  judge: built, CLI at $BIN_DIR/judge"
  case ":$PATH:" in *":$BIN_DIR:"*) ;; *) echo "  WARN: $BIN_DIR is not on PATH" ;; esac

  SETTINGS_FILE="${CLAUDE_SETTINGS_FILE:-$HOME/.claude/settings.json}"
  HOOKS_DIR="${CLAUDE_HOOKS_DIR:-$HOME/.claude/hooks}"
  # shellcheck source=config/lib/merge-hook.sh
  source "$SCRIPT_DIR/config/lib/merge-hook.sh"
  mkdir -p "$HOOKS_DIR"
  cp "$SCRIPT_DIR/config/hooks/judge-health.sh" "$HOOKS_DIR/judge-health.sh"
  chmod +x "$HOOKS_DIR/judge-health.sh"
  ENTRY=$(jq -nc --arg c "$HOOKS_DIR/judge-health.sh # aw:judge-health" '{hooks:[{type:"command",command:$c}]}')
  merge_hook "$SETTINGS_FILE" SessionStart aw:judge-health "$ENTRY"
  echo "  judge: SessionStart health hook installed"
  # Wake gating (lever 1A: send-gate, record-teammate-name, outbox-flush) is
  # a separate, explicitly-approved install — scripts/install-wake-gating.sh
  # — never turned on as a side effect of installing judge itself (the user
  # approves live steps one at a time; "install judge" silently activating
  # the send gate on every future SendMessage would violate that).
else
  echo "  judge: package.json not found, skipping"
fi
