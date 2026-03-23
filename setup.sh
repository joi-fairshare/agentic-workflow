#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

# Check for jq (required by statusline install and runtime)
if ! command -v jq &>/dev/null; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║                  MISSING REQUIRED DEPENDENCY                ║"
  echo "║                                                              ║"
  echo "║  jq is required to install and run the Claude Code          ║"
  echo "║  statusline. Without it, setup cannot wire the statusline   ║"
  echo "║  into your Claude settings and the script will not work.    ║"
  echo "║                                                              ║"
  echo "║  Install jq, then re-run setup:                             ║"
  echo "║    brew install jq        (macOS)                           ║"
  echo "║    apt-get install jq     (Debian/Ubuntu)                   ║"
  echo "║    dnf install jq         (Fedora/RHEL)                     ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  exit 1
fi

# Canonical list of skills managed by this toolkit
MANAGED_SKILLS=(review postReview addressReview enhancePrompt rootCause bugHunt bugReport shipRelease syncDocs weeklyRetro officeHours productReview archReview design-analyze design-language design-evolve design-mockup design-implement design-refine design-verify verify-app)

echo "=== Agentic Workflow Setup ==="
echo ""

# --- Helper: install or refresh a skill symlink ---
install_skill() {
  local skill="$1"
  local target="$2"
  local source="$3"

  if [ -L "$target" ]; then
    local current_target
    current_target=$(readlink "$target" 2>/dev/null || echo "")

    if [ "$current_target" = "$source" ]; then
      echo "  $skill: up to date"
    elif [[ "$current_target" == *"/agentic-workflow/"* ]] || [[ "$current_target" == *"/agentic-workflow-"* ]]; then
      # Symlink points to a previous agentic-workflow install — refresh it
      rm "$target"
      ln -s "$source" "$target"
      echo "  $skill: refreshed (was: $current_target)"
    else
      # Symlink points to a different source entirely — collision
      echo ""
      echo "  ⚠ COLLISION: $skill"
      echo "    Existing symlink points to: $current_target"
      echo "    Our source is:              $source"
      echo "    This may be a different skill with the same name from another toolkit."
      echo "    Replace with ours? (y/n)"
      read -r answer
      if [ "$answer" = "y" ]; then
        rm "$target"
        ln -s "$source" "$target"
        echo "  $skill: replaced (backed up target was a symlink, original still exists at: $current_target)"
      else
        echo "  $skill: skipped (keeping existing)"
      fi
    fi
  elif [ -d "$target" ]; then
    # Real directory (not a symlink) — potential collision from another source
    # Check if it has a SKILL.md we can inspect for name match
    if [ -f "$target/SKILL.md" ]; then
      local existing_name
      existing_name=$(grep -m1 '^name:' "$target/SKILL.md" 2>/dev/null | sed 's/^name:[[:space:]]*//' || echo "")
      if [ "$existing_name" = "$skill" ]; then
        echo ""
        echo "  ⚠ COLLISION: $skill"
        echo "    A non-symlinked directory exists at: $target"
        echo "    It contains a skill named '$existing_name' — this appears to match ours."
        echo "    Back up and replace with symlink? (y/n)"
      else
        echo ""
        echo "  ⚠ COLLISION: $skill"
        echo "    A non-symlinked directory exists at: $target"
        echo "    It contains a skill named '$existing_name' — this does NOT match our '$skill' skill."
        echo "    This is likely a DIFFERENT skill from another toolkit."
        echo "    Back up and replace with symlink? (y/n)"
      fi
      read -r answer
    else
      echo ""
      echo "  ⚠ COLLISION: $skill"
      echo "    A directory exists at: $target (no SKILL.md found — unknown origin)"
      echo "    Back up and replace with symlink? (y/n)"
      read -r answer
    fi

    if [ "$answer" = "y" ]; then
      mv "$target" "$target.bak.$(date +%s)"
      ln -s "$source" "$target"
      echo "  $skill: backed up and linked"
    else
      echo "  $skill: skipped (keeping existing directory)"
    fi
  elif [ -f "$target" ]; then
    echo "  $skill: WARNING — a file (not directory) exists at $target, skipping"
  else
    ln -s "$source" "$target"
    echo "  $skill: linked"
  fi
}

# --- Skills ---
echo "Installing skills..."
mkdir -p "$CLAUDE_DIR/skills"

for skill in "${MANAGED_SKILLS[@]}"; do
  install_skill "$skill" "$CLAUDE_DIR/skills/$skill" "$SCRIPT_DIR/skills/$skill"
done

# --- Bootstrap Skill (separate dir) ---
echo ""
echo "Installing bootstrap skill..."
install_skill "bootstrap" "$CLAUDE_DIR/skills/bootstrap" "$SCRIPT_DIR/bootstrap"

# --- Clean up stale skills from previous versions ---
echo ""
echo "Checking for stale skills..."

# Build a lookup of current managed skills (including bootstrap)
ALL_MANAGED=("${MANAGED_SKILLS[@]}" "bootstrap")

for existing in "$CLAUDE_DIR/skills"/*/; do
  [ -d "$existing" ] || continue
  skill_name=$(basename "$existing")

  # Skip if it's in our managed list
  is_managed=false
  for managed in "${ALL_MANAGED[@]}"; do
    if [ "$skill_name" = "$managed" ]; then
      is_managed=true
      break
    fi
  done
  $is_managed && continue

  # Only flag symlinks that point into our repo as stale
  if [ -L "$existing" ]; then
    link_target=$(readlink "$existing" 2>/dev/null || echo "")
    if [[ "$link_target" == *"/agentic-workflow/"* ]] || [[ "$link_target" == *"/agentic-workflow-"* ]]; then
      echo "  ⚠ STALE: $skill_name → $link_target"
      echo "    This skill was installed by a previous version of agentic-workflow but is no longer in the current version."
      echo "    Remove it? (y/n)"
      read -r answer
      if [ "$answer" = "y" ]; then
        rm "$existing"
        echo "  $skill_name: removed"
      else
        echo "  $skill_name: kept"
      fi
    fi
  fi
done

# --- Settings ---
echo ""
echo "Installing settings..."

SETTINGS_FILE="$CLAUDE_DIR/settings.json"
if [ -f "$SETTINGS_FILE" ]; then
  echo "  settings.json already exists."
  echo "  Current file will NOT be overwritten."
  echo "  Compare manually: diff $SETTINGS_FILE $SCRIPT_DIR/config/settings.json"
else
  cp "$SCRIPT_DIR/config/settings.json" "$SETTINGS_FILE"
  echo "  settings.json: copied"
fi

# --- Statusline ---
echo ""
echo "Installing statusline..."
cp "$SCRIPT_DIR/config/statusline.sh" "$CLAUDE_DIR/statusline.sh"
chmod +x "$CLAUDE_DIR/statusline.sh"
echo "  statusline script installed"

# Merge statusLine into existing settings.json if absent
if [ -f "$SETTINGS_FILE" ]; then
  if command -v jq &>/dev/null; then
    # Add statusLine key if absent (use has() so null values are not re-merged)
    if ! jq -e 'has("statusLine")' "$SETTINGS_FILE" &>/dev/null; then
      jq '. + {"statusLine": {"type": "command", "command": "~/.claude/statusline.sh"}}' \
        "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" \
        && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
      echo "  statusLine config added to existing settings.json"
    fi

    # Merge Stop hook if not already present
    if ! jq -e 'has("hooks") and (.hooks | has("Stop"))' "$SETTINGS_FILE" &>/dev/null; then
      STOP_HOOK='[{"hooks":[{"type":"command","command":"SHELL_PID=$(cat \"$HOME/.claude/shell_pid\" 2>/dev/null); [ -n \"$SHELL_PID\" ] && kill -WINCH \"$SHELL_PID\" 2>/dev/null; sleep 0.05; true"}]}]'
      jq --argjson stop "$STOP_HOOK" '.hooks.Stop = $stop' \
        "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" \
        && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
      echo "  hooks.Stop added to existing settings.json"
    fi

    # Merge PreToolUse hook if not already present
    if ! jq -e 'has("hooks") and (.hooks | has("PreToolUse"))' "$SETTINGS_FILE" &>/dev/null; then
      PRETOOLUSE_HOOK='[{"matcher":".*","hooks":[{"type":"command","command":"SHELL_PID=$(cat \"$HOME/.claude/shell_pid\" 2>/dev/null); [ -n \"$SHELL_PID\" ] && kill -WINCH \"$SHELL_PID\" 2>/dev/null; true"}]}]'
      jq --argjson ptu "$PRETOOLUSE_HOOK" '.hooks.PreToolUse = $ptu' \
        "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" \
        && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
      echo "  hooks.PreToolUse added to existing settings.json"
    fi
  fi
fi

# --- Safety Hooks ---
echo ""
echo "Installing safety hooks..."

HOOKS_DIR="$CLAUDE_DIR/hooks"
mkdir -p "$HOOKS_DIR"

for hook_file in "$SCRIPT_DIR/config/hooks/"*.sh; do
  [ -f "$hook_file" ] || continue
  hook_name="$(basename "$hook_file")"
  cp "$hook_file" "$HOOKS_DIR/$hook_name"
  chmod +x "$HOOKS_DIR/$hook_name"
  echo "  $hook_name: installed"
done

# Merge safety hooks into existing settings.json
if [ -f "$SETTINGS_FILE" ] && command -v jq &>/dev/null; then
  # Replace any existing Bash matcher entry with the canonical one (fully idempotent, handles version drift)
  HOOK_BASH_ENTRY='{"matcher":"Bash","hooks":[{"type":"command","command":"~/.claude/hooks/block-destructive.sh"},{"type":"command","command":"~/.claude/hooks/block-push-main.sh"},{"type":"command","command":"~/.claude/hooks/detect-secrets.sh"}]}'
  jq --argjson entry "$HOOK_BASH_ENTRY" \
    '.hooks.PreToolUse = ([.hooks.PreToolUse[]? | select(.matcher != "Bash")] + [$entry])' \
    "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" \
    && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  echo "  hooks.PreToolUse: Bash safety hooks installed (idempotent replace)"

  # Add git-context SessionStart hook if not already present
  if ! jq -e '.hooks.SessionStart[]? | select(.hooks[]?.command | test("git-context"))' "$SETTINGS_FILE" &>/dev/null; then
    HOOK_ENTRY='[{"hooks":[{"type":"command","command":"~/.claude/hooks/git-context.sh"}]}]'
    if jq -e 'has("hooks") and (.hooks | has("SessionStart"))' "$SETTINGS_FILE" &>/dev/null; then
      jq --argjson entry '{"hooks":[{"type":"command","command":"~/.claude/hooks/git-context.sh"}]}' '.hooks.SessionStart += [$entry]' \
        "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" \
        && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    else
      jq --argjson entries "$HOOK_ENTRY" '.hooks.SessionStart = $entries' \
        "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" \
        && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    fi
    echo "  hooks.SessionStart: git-context added"
  fi
fi

# --- Shell Integration (terminal width sync for statusline) ---
echo ""
echo "Installing shell integration..."

SHELL_INTEGRATION_FILE="$CLAUDE_DIR/shell-integration.sh"
# Write integration content to a temp file first; skip overwrite if identical
_SI_TMP="$(mktemp)"
cat > "$_SI_TMP" << 'SHELL_EOF'
# Claude Code shell integration — written by agentic-workflow setup.sh
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

if cmp -s "$_SI_TMP" "$SHELL_INTEGRATION_FILE" 2>/dev/null; then
  echo "  shell-integration.sh: already up to date (skipped)"
else
  mv "$_SI_TMP" "$SHELL_INTEGRATION_FILE"
  echo "  shell-integration.sh: written"
fi
rm -f "$_SI_TMP"

# Add one source line to shell config if not already present
INTEGRATION_LINE='[ -f ~/.claude/shell-integration.sh ] && source ~/.claude/shell-integration.sh'
SHELL_CONFIGS=("$HOME/.zshrc" "$HOME/.bashrc")
ADDED_TO=()

for shell_config in "${SHELL_CONFIGS[@]}"; do
  if [ -f "$shell_config" ]; then
    if ! grep -qF 'source ~/.claude/shell-integration.sh' "$shell_config" 2>/dev/null; then
      printf '\n# Claude Code statusline width sync\n%s\n' "$INTEGRATION_LINE" >> "$shell_config"
      ADDED_TO+=("$shell_config")
      echo "  Added to $shell_config"
    else
      echo "  Already in $shell_config"
    fi
  fi
done

# Initialize the width file immediately from the current interactive shell's tty.
# Running shell-integration.sh in a non-interactive subshell leaves $COLUMNS unset,
# causing tput to return 80 regardless of actual terminal size. Reading from /dev/tty
# directly via stty gives the real dimensions of the parent terminal.
CURRENT_WIDTH=$(stty size </dev/tty 2>/dev/null | awk '{print $2}')
CURRENT_WIDTH="${CURRENT_WIDTH:-${COLUMNS:-80}}"
printf '%s\n' "$CURRENT_WIDTH" > "$CLAUDE_DIR/terminal_width"
echo "  terminal_width initialized: $CURRENT_WIDTH cols"

if [ "${#ADDED_TO[@]}" -gt 0 ]; then
  echo ""
  echo "  Shell integration added. To enable width sync in this session:"
  for config in "${ADDED_TO[@]}"; do
    echo "    source $config"
  done
fi

# --- MCP Config ---
echo ""
echo "Installing MCP config..."

MCP_FILE="$CLAUDE_DIR/mcp.json"
if [ -f "$MCP_FILE" ]; then
  echo "  mcp.json already exists."
  echo "  Current file will NOT be overwritten."
  echo "  Compare manually: diff $MCP_FILE $SCRIPT_DIR/config/mcp.json"
else
  cp "$SCRIPT_DIR/config/mcp.json" "$MCP_FILE"
  echo "  mcp.json: copied"
fi

# --- MCP Bridge: Install, Build, Register ---
echo ""
echo "Installing MCP bridge..."

BRIDGE_DIR="$SCRIPT_DIR/mcp-bridge"

if [ -f "$BRIDGE_DIR/package.json" ]; then
  (cd "$BRIDGE_DIR" && npm install && npm run build)
  echo "  MCP bridge: built successfully"
else
  echo "  MCP bridge: package.json not found, skipping"
fi

# Register with Claude Code
echo ""
echo "Registering MCP bridge with Claude Code..."
if command -v claude &>/dev/null; then
  if claude mcp list 2>&1 | grep -q "agentic-bridge"; then
    echo "  agentic-bridge: already registered in Claude Code"
  else
    claude mcp add --scope user agentic-bridge -- node "$BRIDGE_DIR/dist/mcp.js"
    echo "  agentic-bridge: registered in Claude Code"
  fi
else
  echo "  claude CLI not found, skipping Claude Code registration"
fi

# Register with Codex
echo ""
echo "Registering MCP bridge with Codex..."
if command -v codex &>/dev/null; then
  if codex mcp list 2>&1 | grep -q "agentic-bridge"; then
    echo "  agentic-bridge: already registered in Codex"
  else
    codex mcp add agentic-bridge -- node "$BRIDGE_DIR/dist/mcp.js"
    echo "  agentic-bridge: registered in Codex"
  fi
else
  echo "  codex CLI not found, skipping Codex registration"
fi

# --- UI ---
echo ""
echo "Installing UI dependencies..."

UI_DIR="$SCRIPT_DIR/ui"

if [ -f "$UI_DIR/package.json" ]; then
  (cd "$UI_DIR" && npm install)
  echo "  UI: dependencies installed"
else
  echo "  UI: package.json not found, skipping"
fi

# --- Serena MCP ---
echo ""
echo "=== Serena prerequisites ==="
command -v docker &>/dev/null || { echo "FATAL: Docker not installed. Install Docker Desktop and re-run setup.sh."; exit 1; }

# Derive version from committed wrapper — single source of truth, no dual-maintenance
SERENA_VERSION=$(grep '^BASE_VERSION=' "$(dirname "$0")/scripts/serena-docker" \
  | sed 's/BASE_VERSION="//;s/".*//')
if [ -z "$SERENA_VERSION" ]; then
  echo "FATAL: Could not parse BASE_VERSION from scripts/serena-docker"; exit 1
fi

echo "=== Building Serena base image (TS + Python) ==="
if ! docker image inspect "serena-local:${SERENA_VERSION}" &>/dev/null; then
  echo "Building serena-local:${SERENA_VERSION} (~5 min)..."
  docker build \
    --pull \
    --progress plain \
    --build-arg BASE_TAG="${SERENA_VERSION}" \
    -t "serena-local:${SERENA_VERSION}" \
    -f "$(dirname "$0")/Dockerfile.serena" \
    "$(dirname "$0")" \
    || { echo "FATAL: Base image build failed."; exit 1; }
  echo "Built serena-local:${SERENA_VERSION}"
else
  echo "serena-local:${SERENA_VERSION} already exists, skipping"
fi

echo "=== Building Serena C# extension image (opt-in) ==="
# Auto-detect C# projects or honour BUILD_CSHARP=1 env var override
_build_csharp=0
if [ "${BUILD_CSHARP:-0}" = "1" ]; then
  _build_csharp=1
elif find "$(dirname "$0")" -maxdepth 3 \( -name "*.csproj" -o -name "*.cs" \) -print -quit 2>/dev/null | grep -q .; then
  _build_csharp=1
fi

if [ "$_build_csharp" = "1" ]; then
  if ! docker image inspect "serena-local:${SERENA_VERSION}-csharp" &>/dev/null; then
    echo "Building serena-local:${SERENA_VERSION}-csharp (~15 min — .NET SDK download)..."
    docker build \
      --pull \
      --progress plain \
      --build-arg LOCAL_TAG="${SERENA_VERSION}" \
      -t "serena-local:${SERENA_VERSION}-csharp" \
      -f "$(dirname "$0")/Dockerfile.serena-csharp" \
      "$(dirname "$0")" \
      || { echo "FATAL: C# image build failed."; exit 1; }
    echo "Built serena-local:${SERENA_VERSION}-csharp"
  else
    echo "serena-local:${SERENA_VERSION}-csharp already exists, skipping"
  fi
else
  echo "=== Skipping C# Serena image (no .csproj/.cs found) ==="
  echo "To build later, run: BUILD_CSHARP=1 ./setup.sh"
fi

echo "=== Installing serena-docker wrapper ==="
mkdir -p "$HOME/.local/bin"
cp "$(dirname "$0")/scripts/serena-docker" "$HOME/.local/bin/serena-docker"
chmod +x "$HOME/.local/bin/serena-docker"

if ! echo "$PATH" | tr ':' '\n' | grep -qx "$HOME/.local/bin"; then
  echo "WARN: ~/.local/bin is not in \$PATH. Add to your shell profile:"
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

echo "=== Registering Serena MCP (global) ==="
claude mcp add --scope user serena -- "$HOME/.local/bin/serena-docker" \
  2>/dev/null \
  || echo "WARN: Serena already registered (or claude CLI not found)"

echo "=== Security check ==="
if grep -qE "Users/${USER}/\*\*|home/${USER}/\*\*" "$HOME/.claude/settings.local.json" 2>/dev/null; then
  echo "WARN: Broad Read rule detected in settings.local.json — narrow to repos/**, .claude/**, .agentic-workflow/**"
fi

# --- Claude Code Plugins ---
echo ""
echo "Installing Claude Code plugins..."

if command -v claude &>/dev/null; then
  # Marketplaces
  MARKETPLACES=(
    "anthropics/claude-plugins-official"
    "VoltAgent/awesome-claude-code-subagents"
    "EveryInc/compound-engineering-plugin"
  )

  for repo in "${MARKETPLACES[@]}"; do
    name=$(basename "$repo")
    if claude plugins marketplace list 2>&1 | grep -q "$name"; then
      echo "  marketplace $name: already added"
    else
      claude plugins marketplace add "github:$repo" 2>&1 && \
        echo "  marketplace $name: added" || \
        echo "  marketplace $name: failed to add (non-fatal)"
    fi
  done

  # Plugins
  PLUGINS=(
    "github@claude-plugins-official"
    "superpowers@claude-plugins-official"
    "compound-engineering@compound-engineering-plugin"
    "playwright@claude-plugins-official"
  )

  for plugin in "${PLUGINS[@]}"; do
    if claude plugins list 2>&1 | grep -q "$plugin"; then
      echo "  plugin $plugin: already installed"
    else
      claude plugins install "$plugin" 2>&1 && \
        echo "  plugin $plugin: installed" || \
        echo "  plugin $plugin: failed to install (non-fatal)"
    fi
  done
else
  echo "  claude CLI not found, skipping plugin installation"
fi

# --- Dembrandt CLI ---
echo ""
echo "Installing Dembrandt CLI..."

DEMBRANDT_VERSION="0.7.0"

if command -v dembrandt &>/dev/null; then
  echo "  dembrandt: already installed ($(dembrandt --version 2>/dev/null || echo 'unknown version'))"
else
  npm install -g "dembrandt@$DEMBRANDT_VERSION" 2>&1 && \
    echo "  dembrandt: installed globally ($DEMBRANDT_VERSION)" || \
    echo "  dembrandt: failed to install (non-fatal, install manually: npm install -g dembrandt)"
fi

# --- Impeccable Skills ---
echo ""
echo "Installing Impeccable skills..."

IMPECCABLE_VERSION="d6b1a56bc5b79e9375be0f8508b4daa1678fb058"
IMPECCABLE_DIR="$HOME/.claude/impeccable-cache"
IMPECCABLE_SKILLS_SRC="$IMPECCABLE_DIR/dist/claude-code"

if [ -d "$IMPECCABLE_SKILLS_SRC" ]; then
  echo "  impeccable: cache exists, checking for updates..."
  (cd "$IMPECCABLE_DIR" && git fetch origin && git checkout "$IMPECCABLE_VERSION") || \
    echo "  Warning: Could not update Impeccable cache. Using existing version."
else
  echo "  impeccable: cloning pbakaus/impeccable..."
  git clone https://github.com/pbakaus/impeccable.git "$IMPECCABLE_DIR" 2>&1 && \
    (cd "$IMPECCABLE_DIR" && git checkout "$IMPECCABLE_VERSION") || {
    echo "  impeccable: failed to clone (non-fatal)"
    IMPECCABLE_SKILLS_SRC=""
  }
fi

if [ -n "$IMPECCABLE_SKILLS_SRC" ] && [ -d "$IMPECCABLE_SKILLS_SRC" ]; then
  for skill_dir in "$IMPECCABLE_SKILLS_SRC"/*/; do
    [ -d "$skill_dir" ] || continue
    skill_name=$(basename "$skill_dir")
    target="$CLAUDE_DIR/skills/$skill_name"
    # Always copy from cache (overwrite existing) — content is deterministic because
    # we pin to a specific commit hash, so re-copying is safe and ensures updates propagate.
    [ -L "$target" ] && rm "$target"
    [ -d "$target" ] && rm -rf "$target"
    cp -r "$skill_dir" "$target"
    echo "  impeccable/$skill_name: installed"
  done
else
  echo "  impeccable: skipped (source not available)"
fi

# --- Output Directory ---
echo ""
echo "Creating output directory..."
mkdir -p "$HOME/.agentic-workflow"
echo "  ~/.agentic-workflow/: created"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Skills installed (21):"
echo "  Review pipeline:  review, postReview, addressReview"
echo "  Investigation:    rootCause"
echo "  QA:               bugHunt, bugReport"
echo "  Release:          shipRelease, syncDocs"
echo "  Retrospective:    weeklyRetro"
echo "  Planning:         officeHours, productReview, archReview"
echo "  Design:           design-analyze, design-language, design-evolve,"
echo "                    design-mockup, design-implement, design-refine, design-verify"
echo "  Utilities:        enhancePrompt, bootstrap"
echo ""
echo "Config location:    $CLAUDE_DIR/"
echo "Statusline:         $CLAUDE_DIR/statusline.sh"
echo "Output directory:   ~/.agentic-workflow/<repo-slug>/"
echo "Rules directory:    .claude/rules/ (auto-loaded by Claude Code)"
echo "MCP bridge:         $BRIDGE_DIR/"
echo "MCP registered:     Claude Code + Codex (agentic-bridge)"
echo "Plugins:            github, superpowers, compound-engineering, playwright"
echo "UI dashboard:       $UI_DIR/ (npm run dev → :3000)"
