#!/usr/bin/env bash
# Tests for scripts/probe.sh. Run: bash scripts/tests/probe.test.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
fail=0

check() {
  if [ "$2" == "$3" ]; then echo "ok - $1"; else
    echo "not ok - $1"; echo "  expected: $3"; echo "  actual:   $2"; fail=1
  fi
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

new_env() {
  # Fresh settings/hooks dirs per case, so on/off/status never touch ~/.claude.
  export CLAUDE_SETTINGS_FILE="$WORK/case-$RANDOM/settings.json"
  export CLAUDE_HOOKS_DIR="$WORK/case-$RANDOM/hooks"
  mkdir -p "$(dirname "$CLAUDE_SETTINGS_FILE")"
}

# --- round trip: on, status, off gives identical JSON under jq -S ---
new_env
bash "$ROOT/scripts/probe.sh" on >/dev/null
before="$(jq -Sc . "$CLAUDE_SETTINGS_FILE")"
"$ROOT/scripts/probe.sh" status >/dev/null || true
after_status="$(jq -Sc . "$CLAUDE_SETTINGS_FILE")"
check "status does not modify settings.json" "$after_status" "$before"
bash "$ROOT/scripts/probe.sh" off >/dev/null
bash "$ROOT/scripts/probe.sh" on >/dev/null
after="$(jq -Sc . "$CLAUDE_SETTINGS_FILE")"
check "round trip: on, off, on gives identical JSON" "$after" "$before"
bash "$ROOT/scripts/probe.sh" off >/dev/null

# --- on/off never touch the real ~/.claude ---
check "HOOKS_DIR override used (not real ~/.claude/hooks)" "$(echo "$CLAUDE_HOOKS_DIR" | grep -c "^$WORK")" "1"
check "SETTINGS_FILE override used (not real ~/.claude/settings.json)" "$(echo "$CLAUDE_SETTINGS_FILE" | grep -c "^$WORK")" "1"

# --- failing-jq-shim case: exit 1, and the file is byte-identical to before ---
new_env
echo '{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"~/.claude/hooks/other.sh"}]}]}}' > "$CLAUDE_SETTINGS_FILE"
before_sum="$(shasum "$CLAUDE_SETTINGS_FILE")"

SHIM_DIR="$WORK/shim"
mkdir -p "$SHIM_DIR"
REAL_JQ="$(command -v jq)"
COUNTER_FILE="$WORK/jq-call-count"
echo 0 > "$COUNTER_FILE"
cat > "$SHIM_DIR/jq" <<EOF
#!/usr/bin/env bash
count=\$(cat "$COUNTER_FILE")
count=\$((count + 1))
echo "\$count" > "$COUNTER_FILE"
if [ "\$count" -eq 2 ]; then
  echo "jq shim: forced failure on 2nd call" >&2
  exit 1
fi
exec "$REAL_JQ" "\$@"
EOF
chmod +x "$SHIM_DIR/jq"

set +e
PATH="$SHIM_DIR:$PATH" bash "$ROOT/scripts/probe.sh" on >/dev/null 2>"$WORK/stderr"
rc=$?
set -e
check "failing jq shim: probe.sh on exits 1" "$rc" "1"
check "failing jq shim: prints restore message to stderr" "$(grep -c "probe: failed, settings.json restored" "$WORK/stderr")" "1"
after_sum="$(shasum "$CLAUDE_SETTINGS_FILE")"
check "failing jq shim: settings.json is byte-identical to before" "$after_sum" "$before_sum"
check "no leftover backup file beside settings.json after failure" \
  "$(find "$(dirname "$CLAUDE_SETTINGS_FILE")" -maxdepth 1 -name ".$(basename "$CLAUDE_SETTINGS_FILE").probe-backup.*" | wc -l | tr -d ' ')" "0"

# --- entry() hook path: literal ~/.claude/hooks/probe-log.sh when CLAUDE_HOOKS_DIR unset ---
new_env
unset CLAUDE_HOOKS_DIR
bash "$ROOT/scripts/probe.sh" on >/dev/null
check "entry() uses literal ~/.claude/hooks path when CLAUDE_HOOKS_DIR is unset" \
  "$(jq -r '.hooks.Stop[0].hooks[0].command' "$CLAUDE_SETTINGS_FILE")" \
  "~/.claude/hooks/probe-log.sh Stop # aw:probe"
bash "$ROOT/scripts/probe.sh" off >/dev/null

# --- entry() hook path: $HOOKS_DIR/probe-log.sh when CLAUDE_HOOKS_DIR is set ---
new_env
bash "$ROOT/scripts/probe.sh" on >/dev/null
check "entry() uses \$HOOKS_DIR path when CLAUDE_HOOKS_DIR is set" \
  "$(jq -r '.hooks.Stop[0].hooks[0].command' "$CLAUDE_SETTINGS_FILE")" \
  "$CLAUDE_HOOKS_DIR/probe-log.sh Stop # aw:probe"
bash "$ROOT/scripts/probe.sh" off >/dev/null

exit $fail
