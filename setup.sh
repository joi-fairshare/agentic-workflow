#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

# Canonical list of skills managed by this toolkit
MANAGED_SKILLS=(review postReview addressReview enhancePrompt rootCause bugHunt bugReport shipRelease syncDocs weeklyRetro officeHours productReview archReview)

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

# --- Output Directory ---
echo ""
echo "Creating output directory..."
mkdir -p "$HOME/.agentic-workflow"
echo "  ~/.agentic-workflow/: created"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Skills installed (14):"
echo "  Review pipeline:  review, postReview, addressReview"
echo "  Investigation:    rootCause"
echo "  QA:               bugHunt, bugReport"
echo "  Release:          shipRelease, syncDocs"
echo "  Retrospective:    weeklyRetro"
echo "  Planning:         officeHours, productReview, archReview"
echo "  Utilities:        enhancePrompt, bootstrap"
echo ""
echo "Config location:    $CLAUDE_DIR/"
echo "Output directory:   ~/.agentic-workflow/<repo-slug>/"
echo "MCP bridge:         $BRIDGE_DIR/"
echo "MCP registered:     Claude Code + Codex (agentic-bridge)"
echo "Plugins:            github, superpowers, compound-engineering, playwright"
echo "UI dashboard:       $UI_DIR/ (npm run dev → :3000)"
