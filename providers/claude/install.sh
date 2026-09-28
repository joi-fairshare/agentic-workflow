#!/usr/bin/env bash
# Claude Code adapter for the Vitalize Workflow Toolkit installer.
# Sourced by setup.sh (after providers/lib.sh). Defines claude_* functions only.
#
# End state (unchanged from the pre-multi-provider setup.sh):
#   ~/.claude/skills/<name>  → symlinks into this repo (+ bootstrap, + external packs)
#   ~/.claude/settings.json  (copied if absent; statusLine + WINCH hooks merged)
#   ~/.claude/statusline.sh, ~/.claude/shell-integration.sh (+ rc source line)
#   ~/.claude/hooks/*        via providers/claude/install-hooks.sh
#   ~/.claude/agents/*.md    via --install-agents
#   MCP servers registered with `claude mcp add --scope user`

CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"

claude_detect() { aw_has claude; }
claude_skills_dir() { echo "$CLAUDE_DIR/skills"; }
claude_agents_dir() { echo "$CLAUDE_DIR/agents"; }

claude_install_settings() {
  echo ""
  echo "Installing Claude Code settings..."
  local settings="$CLAUDE_DIR/settings.json"
  if [ -f "$settings" ]; then
    echo "  settings.json already exists."
    echo "  Current file will NOT be overwritten."
    echo "  Compare manually: diff $settings $TOOLKIT_DIR/config/settings.json"
  else
    aw_run mkdir -p "$CLAUDE_DIR"
    aw_run cp "$TOOLKIT_DIR/config/settings.json" "$settings"
    echo "  settings.json: copied"
  fi

  echo ""
  echo "Installing statusline..."
  aw_run cp "$TOOLKIT_DIR/config/statusline.sh" "$CLAUDE_DIR/statusline.sh"
  aw_run chmod +x "$CLAUDE_DIR/statusline.sh"
  echo "  statusline script installed"

  [ -f "$settings" ] || return 0
  aw_dry && { echo "  [dry-run] would merge statusLine + WINCH Stop/PreToolUse hooks into $settings if absent"; return 0; }

  # Add statusLine key if absent (use has() so null values are not re-merged)
  if ! jq -e 'has("statusLine")' "$settings" &>/dev/null; then
    jq '. + {"statusLine": {"type": "command", "command": "~/.claude/statusline.sh"}}' \
      "$settings" > "$settings.tmp" && mv "$settings.tmp" "$settings"
    echo "  statusLine config added to existing settings.json"
  fi

  # Merge Stop hook (statusline width refresh) if not already present
  if ! jq -e 'has("hooks") and (.hooks | has("Stop"))' "$settings" &>/dev/null; then
    local stop_hook='[{"hooks":[{"type":"command","command":"SHELL_PID=$(cat \"$HOME/.claude/shell_pid\" 2>/dev/null); [ -n \"$SHELL_PID\" ] && kill -WINCH \"$SHELL_PID\" 2>/dev/null; sleep 0.05; true"}]}]'
    jq --argjson stop "$stop_hook" '.hooks.Stop = $stop' \
      "$settings" > "$settings.tmp" && mv "$settings.tmp" "$settings"
    echo "  hooks.Stop added to existing settings.json"
  fi

  # Merge PreToolUse hook (statusline width refresh) if not already present
  if ! jq -e 'has("hooks") and (.hooks | has("PreToolUse"))' "$settings" &>/dev/null; then
    local ptu_hook='[{"matcher":".*","hooks":[{"type":"command","command":"SHELL_PID=$(cat \"$HOME/.claude/shell_pid\" 2>/dev/null); [ -n \"$SHELL_PID\" ] && kill -WINCH \"$SHELL_PID\" 2>/dev/null; true"}]}]'
    jq --argjson ptu "$ptu_hook" '.hooks.PreToolUse = $ptu' \
      "$settings" > "$settings.tmp" && mv "$settings.tmp" "$settings"
    echo "  hooks.PreToolUse added to existing settings.json"
  fi
}

claude_install_shell_integration() {
  echo ""
  echo "Installing shell integration (statusline width sync)..."
  if aw_dry; then
    echo "  [dry-run] would write $CLAUDE_DIR/shell-integration.sh and source it from ~/.zshrc / ~/.bashrc"
    return 0
  fi

  local si_file="$CLAUDE_DIR/shell-integration.sh" si_tmp
  si_tmp="$(mktemp)"
  cat > "$si_tmp" << 'SHELL_EOF'
# Claude Code shell integration — written by the Vitalize Workflow Toolkit setup.sh
# Keeps ~/.claude/terminal_width updated so statusline.sh can read the actual
# terminal width. Claude Code subprocesses cannot access /dev/tty or $COLUMNS,
# so the interactive shell (which always has the correct value) writes it here.
#
# Also writes ~/.claude/shell_pid so Claude Code hooks can send SIGWINCH to
# this shell, triggering a width update mid-session when the window is resized.
# When zsh receives SIGWINCH it calls ioctl(TIOCGWINSZ) on its terminal and
# updates $COLUMNS before running the WINCH trap — so $COLUMNS is always current.

_claude_update_width() {
  # Write our PID so hooks can find and signal us
  printf '%s\n' "$$" > "$HOME/.claude/shell_pid"
  # Use $COLUMNS (updated by zsh/bash via ioctl on SIGWINCH) as primary source.
  # tput cols fallback covers environments where $COLUMNS isn't set.
  local width="${COLUMNS:-$(tput cols 2>/dev/null)}"
  [ -n "$width" ] && [ "$width" -gt 0 ] 2>/dev/null && \
    printf '%s\n' "$width" > "$HOME/.claude/terminal_width"
}

if [ -n "$ZSH_VERSION" ]; then
  autoload -U add-zsh-hook 2>/dev/null && add-zsh-hook precmd _claude_update_width
  trap '_claude_update_width' WINCH
elif [ -n "$BASH_VERSION" ]; then
  [[ "$PROMPT_COMMAND" != *"_claude_update_width"* ]] && \
    PROMPT_COMMAND="${PROMPT_COMMAND:+$PROMPT_COMMAND; }_claude_update_width"
  trap '_claude_update_width' WINCH
fi

_claude_update_width
SHELL_EOF

  if cmp -s "$si_tmp" "$si_file" 2>/dev/null; then
    echo "  shell-integration.sh: already up to date (skipped)"
  else
    mv "$si_tmp" "$si_file"
    echo "  shell-integration.sh: written"
  fi
  rm -f "$si_tmp"

  local line='[ -f ~/.claude/shell-integration.sh ] && source ~/.claude/shell-integration.sh'
  local rc added=""
  for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
    [ -f "$rc" ] || continue
    if ! grep -qF 'source ~/.claude/shell-integration.sh' "$rc" 2>/dev/null; then
      printf '\n# Claude Code statusline width sync\n%s\n' "$line" >> "$rc"
      added="$added $rc"
      echo "  Added to $rc"
    else
      echo "  Already in $rc"
    fi
  done

  # Initialize the width file from the parent terminal (a non-interactive
  # subshell has no $COLUMNS, so read /dev/tty directly via stty).
  local width
  width=$(stty size </dev/tty 2>/dev/null | awk '{print $2}')
  width="${width:-${COLUMNS:-80}}"
  printf '%s\n' "$width" > "$CLAUDE_DIR/terminal_width"
  echo "  terminal_width initialized: $width cols"

  if [ -n "$added" ]; then
    echo ""
    echo "  Shell integration added. To enable width sync in this session:"
    for rc in $added; do echo "    source $rc"; done
  fi
}

claude_install_legacy_mcp_json() {
  echo ""
  echo "Installing MCP config..."
  local mcp_file="$CLAUDE_DIR/mcp.json"
  if [ -f "$mcp_file" ]; then
    echo "  mcp.json already exists."
    echo "  Current file will NOT be overwritten."
    echo "  Compare manually: diff $mcp_file $TOOLKIT_DIR/config/mcp.json"
  else
    aw_run cp "$TOOLKIT_DIR/config/mcp.json" "$mcp_file"
    echo "  mcp.json: copied"
  fi
}

claude_install_hooks() {
  echo ""
  echo "Installing Claude Code hooks..."
  local hooks_script="$TOOLKIT_DIR/providers/claude/install-hooks.sh"
  if [ ! -f "$hooks_script" ]; then
    echo "  WARN: $hooks_script not found — safety hooks not installed"
  else
    TOOLKIT_DIR="$TOOLKIT_DIR" CLAUDE_DIR="$CLAUDE_DIR" AW_DRY_RUN="${AW_DRY_RUN:-0}" bash "$hooks_script"
  fi

  # judge's SessionStart health hook lands after settings.json is seeded.
  if aw_dry; then
    echo "  [dry-run] would run scripts/install-judge.sh --hook-only"
  else
    bash "$TOOLKIT_DIR/scripts/install-judge.sh" --hook-only
  fi
  aw_install_levers claude
}

claude_mcp_present() {
  local name="$1"
  if [ -f "$HOME/.claude.json" ] && jq -e --arg n "$name" '.mcpServers[$n] != null' "$HOME/.claude.json" &>/dev/null; then
    return 0
  fi
  # `claude mcp get` health-checks and may rewrite ~/.claude.json; skip it in dry-run.
  aw_dry && return 1
  claude mcp get "$name" &>/dev/null
}

claude_mcp_add() {
  local envflags=() e
  for e in ${AW_MCP_ENV[@]+"${AW_MCP_ENV[@]}"}; do envflags+=(--env "$e"); done
  aw_run claude mcp add --scope user "$AW_MCP_NAME" ${envflags[@]+"${envflags[@]}"} \
    -- "$AW_MCP_CMD" ${AW_MCP_ARGV[@]+"${AW_MCP_ARGV[@]}"}
}

claude_register_mcp() {
  aw_mcp_register_cli "Claude Code" claude_mcp_present claude_mcp_add
}

claude_install_plugins() {
  echo ""
  echo "Installing Claude Code plugins..."
  if aw_dry; then
    echo "  [dry-run] would add marketplaces and install plugins: github, superpowers, compound-engineering, playwright"
    return 0
  fi
  local repo name plugin
  for repo in "anthropics/claude-plugins-official" "VoltAgent/awesome-claude-code-subagents" "EveryInc/compound-engineering-plugin"; do
    name=$(basename "$repo")
    if claude plugins marketplace list 2>&1 | grep -q "$name"; then
      echo "  marketplace $name: already added"
    else
      claude plugins marketplace add "github:$repo" 2>&1 && \
        echo "  marketplace $name: added" || \
        echo "  marketplace $name: failed to add (non-fatal)"
    fi
  done
  for plugin in "github@claude-plugins-official" "superpowers@claude-plugins-official" "compound-engineering@compound-engineering-plugin" "playwright@claude-plugins-official"; do
    if claude plugins list 2>&1 | grep -q "$plugin"; then
      echo "  plugin $plugin: already installed"
    else
      claude plugins install "$plugin" 2>&1 && \
        echo "  plugin $plugin: installed" || \
        echo "  plugin $plugin: failed to install (non-fatal)"
    fi
  done
}

claude_security_check() {
  if grep -qE "Users/${USER:-}/\*\*|home/${USER:-}/\*\*" "$CLAUDE_DIR/settings.local.json" 2>/dev/null; then
    echo "WARN: Broad Read rule detected in settings.local.json — narrow to repos/**, .claude/**, .agentic-workflow/**"
  fi
}

claude_install_agents() {
  local manifest="$AW_STATE_ROOT/managed/agents.json"
  aw_run mkdir -p "$AW_STATE_ROOT/managed"
  aw_dry || { [ -f "$manifest" ] || echo '{}' > "$manifest"; }
  install_agents "$TOOLKIT_DIR/config/agents" "$(claude_agents_dir)" "$manifest" claude
  echo "  claude: lean agent types → $(claude_agents_dir) (manifest: $manifest)"
}

# Full Claude install (skills, config, hooks, MCP, plugins). Agents are opt-in
# via `setup.sh --install-agents`.
claude_install() {
  echo ""
  echo "=== Provider: Claude Code ==="
  aw_install_skills_into "$(claude_skills_dir)"
  claude_install_settings
  claude_install_hooks
  claude_install_shell_integration
  claude_install_legacy_mcp_json
  claude_register_mcp
  echo "=== Security check ==="
  claude_security_check
  claude_install_plugins
}
