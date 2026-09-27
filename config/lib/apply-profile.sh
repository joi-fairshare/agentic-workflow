#!/usr/bin/env bash
# Merges a profile's skillOverrides into a settings.local.json. Ownership of
# each key this tool writes is tracked in an external manifest file, never
# inside the settings file. On re-apply: a key is overwritten only if it's
# absent from the target, or its current value still equals what the
# manifest says we last wrote (meaning the user hasn't touched it since). A key
# the user changed by hand keeps her value; a warning names it. The manifest is
# updated to match whatever value now wins, so the next run's comparison
# stays correct either way.
set -euo pipefail

apply_profile() {
  local settings_file="$1" profile_file="$2" manifest_file="$3"
  [ -f "$settings_file" ] || echo '{}' > "$settings_file"
  [ -f "$manifest_file" ] || echo '{}' > "$manifest_file"

  local keys
  keys="$(jq -r '.skillOverrides // {} | keys[]' "$profile_file")"
  local tmp_settings tmp_manifest
  tmp_settings="$(cat "$settings_file")"
  tmp_manifest="$(cat "$manifest_file")"

  local key profile_value current_value last_written_value
  while IFS= read -r key; do
    [ -z "$key" ] && continue
    profile_value="$(jq -r --arg k "$key" '.skillOverrides[$k]' "$profile_file")"
    current_value="$(echo "$tmp_settings" | jq -r --arg k "$key" '.skillOverrides[$k] // empty')"
    last_written_value="$(echo "$tmp_manifest" | jq -r --arg k "$key" '.skillOverrides[$k] // empty')"
    if [ -z "$current_value" ] || [ "$current_value" = "$last_written_value" ]; then
      tmp_settings="$(echo "$tmp_settings" | jq --arg k "$key" --arg v "$profile_value" '.skillOverrides = ((.skillOverrides // {}) + {($k): $v})')"
      tmp_manifest="$(echo "$tmp_manifest" | jq --arg k "$key" --arg v "$profile_value" '.skillOverrides = ((.skillOverrides // {}) + {($k): $v})')"
    else
      echo "keep: $key is set to '$current_value' by hand (we last wrote '$last_written_value', profile wants '$profile_value') — not overwriting" >&2
      tmp_manifest="$(echo "$tmp_manifest" | jq --arg k "$key" --arg v "$current_value" '.skillOverrides = ((.skillOverrides // {}) + {($k): $v})')"
    fi
  done <<< "$keys"

  echo "$tmp_settings" > "$settings_file"
  echo "$tmp_manifest" > "$manifest_file"
}
