# Owner-tagged hook merging for provider hook configs. Source this file.
# A toolkit hook command ends in "# aw:<name>"; merge_hook only ever
# replaces or removes commands carrying its own tag.
#
#   merge_hook       — nested shape: ~/.claude/settings.json, ~/.codex/hooks.json
#   merge_hook_flat  — flat shape:   ~/.cursor/hooks.json ({version:1, hooks:{ev:[{command}]}})
AW_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# _aw_merge <flat:true|false> <file> <event> <id> <entry-json|null>
_aw_merge() {
  local flat="$1" file="$2" event="$3" id="$4" entry="$5" tmp
  if [ ! -f "$file" ]; then
    mkdir -p "$(dirname "$file")"
    echo '{}' > "$file"
  fi
  tmp="$(mktemp "$(dirname "$file")/.$(basename "$file").XXXXXX")"
  if jq --arg event "$event" --arg id "$id" --argjson entry "$entry" --argjson flat "$flat" \
      -f "$AW_LIB_DIR/merge-hook.jq" "$file" > "$tmp"; then
    mv "$tmp" "$file"
  else
    rm -f "$tmp"
    return 1
  fi
}

# merge_hook <settings-file> <event> <id> <entry-json|null>
merge_hook() { _aw_merge false "$@"; }

# merge_hook_flat <cursor-hooks-file> <event> <id> <entry-json|null>
merge_hook_flat() { _aw_merge true "$@"; }

# hook_owners <settings-file>
hook_owners() {
  jq -r -f "$AW_LIB_DIR/hook-owners.jq" "$1"
}
