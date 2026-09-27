#!/usr/bin/env bash
# Tests for config/lib/merge-hook.sh. Run: bash config/lib/tests/merge-hook.test.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../merge-hook.sh
source "$DIR/../merge-hook.sh"
FIX="$DIR/fixtures"
fail=0

check() {
  if [ "$2" == "$3" ]; then echo "ok - $1"; else
    echo "not ok - $1"; echo "  expected: $3"; echo "  actual:   $2"; fail=1
  fi
}
work() { local f; f="$(mktemp)"; cp "$FIX/$1" "$f"; echo "$f"; }

ENTRY='{"hooks":[{"type":"command","command":"~/.claude/hooks/x.sh # aw:x"}]}'

f=$(work empty.json); merge_hook "$f" Stop aw:x "$ENTRY"
check "adds an entry to empty settings" "$(jq -c '.hooks.Stop' "$f")" "[$ENTRY]"
merge_hook "$f" Stop aw:x "$ENTRY"
check "re-running does not duplicate" "$(jq '.hooks.Stop | length' "$f")" "1"

# RF-5: foreign entries survive, re-run is a no-op
f=$(work real-settings.json)
before_ups=$(jq -c '.hooks.UserPromptSubmit' "$f")
before_all=$(jq -c 'del(.hooks.UserPromptSubmit)' "$f")
merge_hook "$f" UserPromptSubmit aw:x "$ENTRY"
check "keeps the prism-route group first" "$(jq -c '.hooks.UserPromptSubmit[0]' "$f")" "$(echo "$before_ups" | jq -c '.[0]')"
check "appends the owned entry last" "$(jq -c '.hooks.UserPromptSubmit[-1]' "$f")" "$ENTRY"
check "leaves every other event untouched" "$(jq -c 'del(.hooks.UserPromptSubmit)' "$f")" "$before_all"
snapshot=$(jq -c . "$f"); merge_hook "$f" UserPromptSubmit aw:x "$ENTRY"
check "re-run on real settings is a no-op" "$(jq -c . "$f")" "$snapshot"

NEW='{"hooks":[{"type":"command","command":"~/.claude/hooks/x2.sh # aw:x"}]}'
merge_hook "$f" UserPromptSubmit aw:x "$NEW"
check "replaces the owned entry by id" \
  "$(jq -c '[.hooks.UserPromptSubmit[].hooks[].command | select(endswith("# aw:x"))]' "$f")" \
  '["~/.claude/hooks/x2.sh # aw:x"]'
merge_hook "$f" UserPromptSubmit aw:x null
check "removal restores the foreign entries exactly" "$(jq -c '.hooks.UserPromptSubmit' "$f")" "$before_ups"

f=$(work empty.json); merge_hook "$f" Stop aw:x "$ENTRY"; merge_hook "$f" Stop aw:x null
check "removing the only entry deletes the event key" "$(jq -c '.hooks | has("Stop")' "$f")" "false"

f=$(work mixed-group.json); merge_hook "$f" PreToolUse aw:x null
check "strips an owned hook from a shared group and keeps the rest" \
  "$(jq -c '.hooks.PreToolUse' "$f")" \
  '[{"matcher":"Bash","hooks":[{"type":"command","command":"~/.claude/hooks/block-destructive.sh"}]}]'

f=$(work empty.json)
merge_hook "$f" Stop aw:xy '{"hooks":[{"type":"command","command":"y.sh # aw:xy"}]}'
merge_hook "$f" Stop aw:x null
check "removing aw:x keeps aw:xy" "$(jq '.hooks.Stop | length' "$f")" "1"

f=$(work empty.json)
if merge_hook "$f" Stop aw:x '{"hooks":[{"type":"command","command":"x.sh"}]}' 2>/dev/null; then r=accepted; else r=rejected; fi
check "rejects an entry whose command is not tagged" "$r" "rejected"
check "a rejected merge leaves the file untouched" "$(jq -c . "$f")" "{}"
if merge_hook "$f" Stop aw:x '{"hooks":[]}' 2>/dev/null; then r=accepted; else r=rejected; fi
check "rejects an entry with no commands" "$r" "rejected"

f="$(mktemp -d)/nested/settings.json"; merge_hook "$f" Stop aw:x "$ENTRY"
check "creates a missing settings file" "$(jq -c '.hooks.Stop' "$f")" "[$ENTRY]"

f=$(work real-settings.json); merge_hook "$f" Stop aw:x "$ENTRY"
check "owners lists the aw id under its event" "$(hook_owners "$f" | awk -F'\t' '$3=="aw:x"{print $1}')" "Stop"
check "owners labels both prism-route hooks" "$(hook_owners "$f" | awk -F'\t' '$3=="prism"' | wc -l | tr -d ' ')" "2"
check "owners labels untagged hooks other" "$(hook_owners "$f" | awk -F'\t' '$3=="other"' | wc -l | tr -d ' ')" "8"

f=$(work empty.json)
merge_hook "$f" Stop aw:x "$ENTRY"
check "no leftover temp files beside settings.json after a successful merge" \
  "$(find "$(dirname "$f")" -maxdepth 1 -name ".$(basename "$f").*" | wc -l | tr -d ' ')" "0"
if merge_hook "$f" Stop aw:x '{"hooks":[{"type":"command","command":"x.sh"}]}' 2>/dev/null; then r=accepted; else r=rejected; fi
check "rejected merge leaves no leftover temp files beside settings.json" \
  "$(find "$(dirname "$f")" -maxdepth 1 -name ".$(basename "$f").*" | wc -l | tr -d ' ')" "0"

exit $fail
