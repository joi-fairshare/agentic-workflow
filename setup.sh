#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

echo "=== Agentic Workflow Setup ==="
echo ""

# --- Skills ---
echo "Installing skills..."
mkdir -p "$CLAUDE_DIR/skills"

for skill in review postReview addressReview enhancePrompt; do
  target="$CLAUDE_DIR/skills/$skill"
  source="$SCRIPT_DIR/skills/$skill"

  if [ -L "$target" ]; then
    echo "  $skill: symlink exists, skipping"
  elif [ -d "$target" ]; then
    echo "  $skill: directory exists (not a symlink). Back it up? (y/n)"
    read -r answer
    if [ "$answer" = "y" ]; then
      mv "$target" "$target.bak.$(date +%s)"
      ln -s "$source" "$target"
      echo "  $skill: backed up and linked"
    else
      echo "  $skill: skipped"
    fi
  else
    ln -s "$source" "$target"
    echo "  $skill: linked"
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

# --- Bootstrap Skill ---
echo ""
echo "Installing bootstrap skill..."

BOOTSTRAP_TARGET="$CLAUDE_DIR/skills/bootstrap"
BOOTSTRAP_SOURCE="$SCRIPT_DIR/bootstrap"

if [ -L "$BOOTSTRAP_TARGET" ]; then
  echo "  bootstrap: symlink exists, skipping"
elif [ -d "$BOOTSTRAP_TARGET" ]; then
  echo "  bootstrap: directory exists, skipping (remove manually to re-link)"
else
  ln -s "$BOOTSTRAP_SOURCE" "$BOOTSTRAP_TARGET"
  echo "  bootstrap: linked"
fi

# --- MCP Bridge Dependencies ---
echo ""
echo "Installing MCP bridge dependencies..."

if [ -f "$SCRIPT_DIR/mcp-bridge/package.json" ]; then
  (cd "$SCRIPT_DIR/mcp-bridge" && npm install)
  echo "  MCP bridge: dependencies installed"
  echo "  Build with: cd mcp-bridge && npm run build"
  echo "  Run with:   cd mcp-bridge && npm start"
else
  echo "  MCP bridge: package.json not found, skipping"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Skills installed:   review, postReview, addressReview, enhancePrompt, bootstrap"
echo "Config location:    $CLAUDE_DIR/"
echo "MCP bridge:         $SCRIPT_DIR/mcp-bridge/"
echo ""
echo "Plugin marketplaces to install manually:"
echo "  - claude-plugins-official (Anthropic official)"
echo "  - voltagent-subagents (subagent catalog)"
echo "  - compound-engineering-plugin (EveryInc/compound-engineering-plugin)"
