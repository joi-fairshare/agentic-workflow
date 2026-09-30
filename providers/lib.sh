#!/usr/bin/env bash
# Shared helpers for Agentic Workflow installer.
#
# Sourced by setup.sh and by providers/<name>/install.sh. Provider-neutral:
# everything here takes the target directory as an argument so the same logic
# (symlink install, collision detection, stale cleanup, external-pack linking)
# runs once per provider skills dir.
#
# Inputs (set by setup.sh before calling):
#   TOOLKIT_DIR               repo root (absolute)
#   MANAGED_SKILLS            bash array of native skill names (excl. bootstrap)
#   DEPRECATED_SKILLS         bash array of skill names to remove on sight
#   AW_EXTERNAL_SKILL_DIRS    newline-separated list of external-pack skill dirs
#   AW_DRY_RUN                1 = print what would change, touch nothing
#
# Compatible with macOS /bin/bash 3.2: no associative arrays, no mapfile, and
# empty-array expansions are guarded for `set -u`.

AW_STATE_ROOT="${AW_STATE_ROOT:-$HOME/.agentic-workflow}"

aw_dry() { [ "${AW_DRY_RUN:-0}" = "1" ]; }

# Run a command, or print it in dry-run mode.
aw_run() {
  if aw_dry; then
    printf '  [dry-run]'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

# Portable canonical path resolver — works on macOS (Python fallback for pre-Big Sur,
# where BSD readlink lacks -f) and Linux (GNU readlink -f).
aw_canonicalize() {
  if command -v readlink &>/dev/null && readlink -f / &>/dev/null; then
    readlink -f "$1" 2>/dev/null || echo "$1"
  elif command -v python3 &>/dev/null; then
    python3 -c "import os, sys; print(os.path.realpath(sys.argv[1]))" "$1"
  else
    (cd "$(dirname "$1")" 2>/dev/null && echo "$(pwd)/$(basename "$1")")
  fi
}

# Ask a y/n question. Returns 0 on "y". Never blocks in dry-run, and treats a
# closed stdin (non-interactive run) as "n" instead of aborting under set -e.
aw_confirm() {
  local answer=""
  if aw_dry; then
    echo "    (dry-run: would prompt here; assuming n)"
    return 1
  fi
  if [ "${AW_ASSUME_YES:-0}" = "1" ]; then
    echo "    (AW_ASSUME_YES=1: answering y)"
    return 0
  fi
  read -r answer || answer="n"
  [ "$answer" = "y" ]
}

# True if a symlink target string points into this toolkit checkout (or a
# previous install of it under the legacy repo name).
aw_is_ours() {
  local link_target="$1"
  local toolkit_canon
  toolkit_canon="$(aw_canonicalize "$TOOLKIT_DIR")"
  case "$link_target" in
    "$TOOLKIT_DIR"/*|"$toolkit_canon"/*) return 0 ;;
    "$AW_STATE_ROOT/toolkit/"*) return 0 ;;
    */agentic-workflow/*|*/agentic-workflow-*) return 0 ;;
    */vitalize-workflow-toolkit/*|*/vitalize-workflow-toolkit-*) return 0 ;;
  esac
  return 1
}

# Install or refresh one skill symlink: aw_install_skill <name> <target-link> <source-dir>
aw_install_skill() {
  local skill="$1" target="$2" source="$3"

  if [ -L "$target" ]; then
    local current_target
    current_target=$(readlink "$target" 2>/dev/null || echo "")

    if [ "$current_target" = "$source" ]; then
      echo "  $skill: up to date"
    elif aw_is_ours "$current_target"; then
      # Symlink points to a previous toolkit install — refresh it
      aw_run rm "$target"
      aw_run ln -s "$source" "$target"
      echo "  $skill: refreshed (was: $current_target)"
    else
      echo ""
      echo "  ⚠ COLLISION: $skill"
      echo "    Existing symlink points to: $current_target"
      echo "    Our source is:              $source"
      echo "    This may be a different skill with the same name from another toolkit."
      echo "    Replace with ours? (y/n)"
      if aw_confirm; then
        aw_run rm "$target"
        aw_run ln -s "$source" "$target"
        echo "  $skill: replaced (original still exists at: $current_target)"
      else
        echo "  $skill: skipped (keeping existing)"
      fi
    fi
  elif [ -d "$target" ]; then
    echo ""
    echo "  ⚠ COLLISION: $skill"
    echo "    A non-symlinked directory exists at: $target"
    if [ -f "$target/SKILL.md" ]; then
      local existing_name
      existing_name=$(grep -m1 '^name:' "$target/SKILL.md" 2>/dev/null | sed 's/^name:[[:space:]]*//' || echo "")
      if [ "$existing_name" = "$skill" ]; then
        echo "    It contains a skill named '$existing_name' — this appears to match ours."
      else
        echo "    It contains a skill named '$existing_name' — this does NOT match our '$skill' skill."
        echo "    This is likely a DIFFERENT skill from another toolkit."
      fi
    else
      echo "    (no SKILL.md found — unknown origin)"
    fi
    echo "    Back up and replace with symlink? (y/n)"
    if aw_confirm; then
      aw_run mv "$target" "$target.bak.$(date +%s)"
      aw_run ln -s "$source" "$target"
      echo "  $skill: backed up and linked"
    else
      echo "  $skill: skipped (keeping existing directory)"
    fi
  elif [ -f "$target" ]; then
    echo "  $skill: WARNING — a file (not directory) exists at $target, skipping"
  else
    aw_run ln -s "$source" "$target"
    echo "  $skill: linked"
  fi
}

# Remove stale copies of skills that were retired (e.g. old impeccable forks).
aw_remove_deprecated_skills() {
  local dir="$1" s target
  for s in ${DEPRECATED_SKILLS[@]+"${DEPRECATED_SKILLS[@]}"}; do
    target="$dir/$s"
    if [ -L "$target" ]; then
      aw_run rm -f "$target"
      echo "  removed stale symlink: $s"
    elif [ -d "$target" ]; then
      aw_run rm -rf "$target"
      echo "  removed deprecated dir: $s"
    fi
  done
}

# Is <name> one of MANAGED_SKILLS or bootstrap?
aw_is_managed() {
  local name="$1" m
  [ "$name" = "bootstrap" ] && return 0
  for m in ${MANAGED_SKILLS[@]+"${MANAGED_SKILLS[@]}"}; do
    [ "$m" = "$name" ] && return 0
  done
  return 1
}

# Offer to remove symlinks into this toolkit that are no longer managed.
aw_cleanup_stale_skills() {
  local dir="$1" existing skill_name link_target
  for existing in "$dir"/*; do
    [ -L "$existing" ] || continue
    skill_name=$(basename "$existing")
    aw_is_managed "$skill_name" && continue
    link_target=$(readlink "$existing" 2>/dev/null || echo "")
    aw_is_ours "$link_target" || continue
    echo "  ⚠ STALE: $skill_name → $link_target"
    echo "    This skill was installed by a previous version of Agentic Workflow but is no longer in the current version."
    echo "    Remove it? (y/n)"
    if aw_confirm; then
      aw_run rm "$existing"
      echo "  $skill_name: removed"
    else
      echo "  $skill_name: kept"
    fi
  done
}

# Link every external-pack skill into <dir>. Native toolkit symlinks win on
# name collision.
aw_link_external_skills() {
  local dir="$1" skill_dir name link pack
  [ -n "${AW_EXTERNAL_SKILL_DIRS:-}" ] || return 0
  while IFS= read -r skill_dir; do
    [ -n "$skill_dir" ] || continue
    [ -f "$skill_dir/SKILL.md" ] || continue
    skill_dir="${skill_dir%/}"
    name="$(basename "$skill_dir")"
    pack="${skill_dir#*/external-skills/}"; pack="${pack%%/*}"
    link="$dir/$name"
    if [ -L "$link" ] && [ -e "$link" ] && aw_is_ours "$(aw_canonicalize "$link")"; then
      echo "  $name: skipping (native skill takes precedence)"
      continue
    fi
    if [ -L "$link" ] && [ "$(readlink "$link")" = "$skill_dir" ]; then
      echo "  $name: up to date ($pack)"
      continue
    fi
    if [ -d "$link" ] && [ ! -L "$link" ]; then
      local backup
      backup="$link.bak.$(date +%s)"
      aw_run mv "$link" "$backup"
      echo "  $name: backed up existing dir to $(basename "$backup") before symlinking"
    fi
    [ -L "$link" ] && aw_run rm -f "$link"
    aw_run ln -sfn "$skill_dir" "$link"
    echo "  $name: symlinked from $pack"
  done <<EOF
$AW_EXTERNAL_SKILL_DIRS
EOF
}

# Full skill install into one provider skills dir.
aw_install_skills_into() {
  local dir="$1" skill
  echo "Installing skills into $dir..."
  aw_run mkdir -p "$dir"
  aw_remove_deprecated_skills "$dir"
  for skill in ${MANAGED_SKILLS[@]+"${MANAGED_SKILLS[@]}"}; do
    aw_install_skill "$skill" "$dir/$skill" "$TOOLKIT_DIR/skills/$skill"
  done
  aw_install_skill "bootstrap" "$dir/bootstrap" "$TOOLKIT_DIR/bootstrap"
  echo "Checking for stale skills in $dir..."
  aw_cleanup_stale_skills "$dir"
  echo "Linking external skill packs into $dir..."
  aw_link_external_skills "$dir"
}

# Skills that ship a TypeScript helper need dist/ built before their SKILL.md
# can run it (skills/<name>/dist/bin.js). Override in tests.
AW_SKILL_PACKAGES=(${AW_SKILL_PACKAGES[@]+"${AW_SKILL_PACKAGES[@]}"})
[ ${#AW_SKILL_PACKAGES[@]} -gt 0 ] || AW_SKILL_PACKAGES=(ui-evidence bugFixOrchestrator)

# Build every skill package: aw_build_skill_packages <toolkit-root>
# A failed build warns and continues — the rest of setup must not abort.
# --ignore-scripts: building needs no dependency install scripts, so none run.
aw_build_skill_packages() {
  local root="$1" name dir
  for name in "${AW_SKILL_PACKAGES[@]}"; do
    dir="$root/skills/$name"
    if [ ! -f "$dir/package.json" ]; then
      echo "  $name: no package.json, skipping"
      continue
    fi
    if aw_dry; then
      echo "  [dry-run] would run: npm ci && npm run build (in $dir)"
      continue
    fi
    if (cd "$dir" && npm ci --ignore-scripts --no-audit --no-fund >/dev/null && npm run build >/dev/null); then
      echo "  $name: built"
    else
      echo "  WARN: $name build failed — run: (cd $dir && npm ci && npm run build)"
    fi
  done
}

# $HOME/.agentic-workflow/toolkit -> repo root. Skills resolve shared fragments
# via $HOME/.agentic-workflow/toolkit/skills/_shared regardless of provider.
aw_link_toolkit() {
  local link="$AW_STATE_ROOT/toolkit"
  aw_run mkdir -p "$AW_STATE_ROOT"
  if [ -L "$link" ] && [ "$(readlink "$link")" = "$TOOLKIT_DIR" ]; then
    echo "  toolkit: $link → $TOOLKIT_DIR (up to date)"
    return 0
  fi
  if [ -e "$link" ] && [ ! -L "$link" ]; then
    echo "  WARN: $link exists and is not a symlink — moving it aside"
    aw_run mv "$link" "$link.bak.$(date +%s)"
  fi
  aw_run ln -sfn "$TOOLKIT_DIR" "$link"
  echo "  toolkit: $link → $TOOLKIT_DIR"
}

# Write $HOME/.agentic-workflow/providers: one "<name> <skills-dir>" line per
# installed provider. Lines for providers not touched by this run are kept as
# long as their skills dir still exists (so `--providers codex` doesn't drop
# a previously-installed claude entry).
# Usage: aw_write_provider_registry "claude /Users/x/.claude/skills" "codex ..."
aw_write_provider_registry() {
  local registry="$AW_STATE_ROOT/providers" tmp line name dir keep entry
  tmp="$(mktemp)"
  for entry in "$@"; do
    printf '%s\n' "$entry" >> "$tmp"
  done
  if [ -f "$registry" ]; then
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      name="${line%% *}"
      dir="${line#* }"
      keep=1
      for entry in "$@"; do
        [ "${entry%% *}" = "$name" ] && keep=0
      done
      if [ "$keep" = "1" ] && [ -d "$dir" ]; then
        printf '%s\n' "$line" >> "$tmp"
      fi
    done < "$registry"
  fi
  sort -u -o "$tmp" "$tmp"
  if aw_dry; then
    echo "  [dry-run] would write $registry:"
    sed 's/^/    /' "$tmp"
    rm -f "$tmp"
  else
    mkdir -p "$AW_STATE_ROOT"
    mv "$tmp" "$registry"
    echo "  provider registry: $registry"
    sed 's/^/    /' "$registry"
  fi
}

# Is <cli> on PATH?
aw_has() { command -v "$1" &>/dev/null; }

# Iterate the MCP server specs (JSON array in AW_MCP_SERVERS) one compact
# object per line: {"name":..,"command":..,"args":[..],"env":{..}}
aw_mcp_each() {
  printf '%s' "${AW_MCP_SERVERS:-[]}" | jq -c '.[]'
}

# Unpack one JSON spec into globals (bash 3.2-safe):
#   AW_MCP_NAME, AW_MCP_CMD, AW_MCP_ARGV (array), AW_MCP_ENV (array of KEY=VALUE)
aw_mcp_unpack() {
  local spec="$1" a
  AW_MCP_NAME="$(printf '%s' "$spec" | jq -r '.name')"
  AW_MCP_CMD="$(printf '%s' "$spec" | jq -r '.command')"
  AW_MCP_ARGV=()
  while IFS= read -r a; do
    AW_MCP_ARGV+=("$a")
  done < <(printf '%s' "$spec" | jq -r '.args[]?')
  AW_MCP_ENV=()
  while IFS= read -r a; do
    [ -n "$a" ] && AW_MCP_ENV+=("$a")
  done < <(printf '%s' "$spec" | jq -r '(.env // {}) | to_entries[] | "\(.key)=\(.value)"')
  return 0
}

# Register every MCP server with a CLI-based provider.
#   aw_mcp_register_cli <label> <present-fn> <add-fn>
# <present-fn> NAME → 0 if already registered; <add-fn> is called after
# aw_mcp_unpack and must run the provider's add command (via aw_run).
aw_mcp_register_cli() {
  local label="$1" present_fn="$2" add_fn="$3" spec
  echo ""
  echo "Registering MCP servers with $label..."
  while IFS= read -r spec; do
    aw_mcp_unpack "$spec"
    if "$present_fn" "$AW_MCP_NAME" </dev/null; then
      echo "  $AW_MCP_NAME: already registered in $label"
      continue
    fi
    if aw_dry; then
      "$add_fn" </dev/null
    elif "$add_fn" </dev/null >/dev/null 2>&1; then
      echo "  $AW_MCP_NAME: registered in $label"
    else
      echo "  WARN: $AW_MCP_NAME registration failed in $label (non-fatal)"
    fi
  done < <(aw_mcp_each)
}

# Cheap-agent-harness lever hooks for one provider. Each scripts/install-*.sh
# takes --provider (default claude) and no-ops with a note where a lever is
# unsupported on that provider.
AW_LEVER_INSTALLERS="install-wake-gating install-context-guard install-scope-gate install-done-gate install-external-write-guard"
aw_install_levers() {
  local provider="$1" inst
  echo ""
  echo "=== Installing lever hooks for $provider (wake gating 1A, context-guard 2B, evaluator gates 3) ==="
  for inst in $AW_LEVER_INSTALLERS; do
    if aw_dry; then
      echo "  [dry-run] would run scripts/$inst.sh --provider $provider"
    else
      bash "$TOOLKIT_DIR/scripts/$inst.sh" --provider "$provider"
    fi
  done
}
