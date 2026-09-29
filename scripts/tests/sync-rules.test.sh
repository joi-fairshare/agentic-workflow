#!/usr/bin/env bash
# Tests for scripts/sync-rules.sh using a temp-dir fixture repo.
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/sync-rules.sh"
PASS=0
FAIL=0
TMPROOT="$(mktemp -d "${TMPDIR:-/tmp}/sync-rules-test.XXXXXX")"
trap 'rm -rf "$TMPROOT"' EXIT

ok()   { PASS=$((PASS + 1)); echo "  ok   $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
check() { if eval "$2"; then ok "$1"; else fail "$1"; fi; }

fixture() {
  local d="$TMPROOT/$1"
  mkdir -p "$d/.agents/rules"
  printf '# AGENTS.md — Fixture\n\n## Commands\n\nmake test\n' > "$d/AGENTS.md"
  cat > "$d/.agents/rules/api.md" <<'EOF'
---
description: API handler conventions
globs:
  - "src/api/**/*.ts"
  - "src/routes/**"
paths:
  - "src/api/**/*.ts"
  - "src/routes/**"
# comment lines in frontmatter are ignored
alwaysApply: false
---

# API Rules
EOF
  cat > "$d/.agents/rules/general.md" <<'EOF'
---
description: "General: applies everywhere"
globs: []
alwaysApply: true
---

# General Rules
EOF
  cat > "$d/.agents/rules/tests.md" <<'EOF'
---
globs: ["**/*.test.ts", "tests/**"]
paths: ["**/*.test.ts", "tests/**"]
---

# Test Rules
EOF
  echo "$d"
}

echo "sync-rules: links"
R="$(fixture links)"
out="$(bash "$SCRIPT" "$R")"
check "exit 0 on first run" "true"
check ".claude/rules is a dir link to ../.agents/rules" '[ -L "$R/.claude/rules" ] && [ "$(readlink "$R/.claude/rules")" = "../.agents/rules" ]'
check ".claude/rules resolves to the rule files" '[ -f "$R/.claude/rules/api.md" ]'
check "one .mdc link per rule" '[ "$(find "$R/.cursor/rules" -type l -name "*.mdc" | wc -l | tr -d " ")" = 3 ]'
check ".mdc link target" '[ "$(readlink "$R/.cursor/rules/api.mdc")" = "../../.agents/rules/api.md" ]'
check ".mdc link resolves to the canonical content" 'cmp -s "$R/.cursor/rules/api.mdc" "$R/.agents/rules/api.md"'
check "CLAUDE.md links to AGENTS.md" '[ -L "$R/CLAUDE.md" ] && [ "$(readlink "$R/CLAUDE.md")" = "AGENTS.md" ]'
check "no copies written" '[ -z "$(find "$R/.cursor" -type f)" ]'

echo "sync-rules: rules index"
check "index markers present" 'grep -q "RULES INDEX START" "$R/AGENTS.md" && grep -q "RULES INDEX END" "$R/AGENTS.md"'
check "scoped rule row lists globs" 'grep -qF "| \`api\` | API handler conventions | \`src/api/**/*.ts\`, \`src/routes/**\` |" "$R/AGENTS.md"'
check "always rule row" 'grep -qF "| \`general\` | General: applies everywhere | always |" "$R/AGENTS.md"'
check "inline list globs parsed" 'grep -qF "\`**/*.test.ts\`, \`tests/**\`" "$R/AGENTS.md"'
check "original AGENTS.md content kept" 'grep -q "make test" "$R/AGENTS.md"'

echo "sync-rules: idempotent"
before="$(cat "$R/AGENTS.md")"
out="$(bash "$SCRIPT" "$R")"
check "second run reports up to date" 'echo "$out" | grep -q "up to date"'
check "AGENTS.md unchanged on rerun" '[ "$before" = "$(cat "$R/AGENTS.md")" ]'
check "--check passes when in sync" 'bash "$SCRIPT" --check "$R" >/dev/null'

echo "sync-rules: add and remove rules"
cp "$R/.agents/rules/general.md" "$R/.agents/rules/extra.md"
check "--check fails for a new rule" '! bash "$SCRIPT" --check "$R" >/dev/null 2>&1'
check "--check writes nothing" '[ ! -e "$R/.cursor/rules/extra.mdc" ]'
bash "$SCRIPT" "$R" >/dev/null
check "new rule linked" '[ -L "$R/.cursor/rules/extra.mdc" ]'
check "new rule in index" 'grep -qF "| \`extra\` |" "$R/AGENTS.md"'
rm "$R/.agents/rules/extra.md"
check "--check fails for a dangling link" '! bash "$SCRIPT" --check "$R" >/dev/null 2>&1'
bash "$SCRIPT" "$R" >/dev/null
check "dangling link removed" '[ ! -L "$R/.cursor/rules/extra.mdc" ]'
check "removed rule dropped from index" '! grep -qF "| \`extra\` |" "$R/AGENTS.md"'

echo "sync-rules: globs/paths mismatch"
M="$(fixture mismatch)"
printf -- '---\nglobs: ["a/**"]\npaths: ["b/**"]\n---\n# Bad\n' > "$M/.agents/rules/bad.md"
check "mismatch exits nonzero" '! bash "$SCRIPT" "$M" >/dev/null 2>&1'
check "mismatch names the rule" '{ bash "$SCRIPT" "$M" 2>&1 || true; } | grep -q "bad.md"'

echo "sync-rules: legacy files"
L="$(fixture legacy)"
mkdir -p "$L/.claude/rules" "$L/.cursor/rules"
echo "hand" > "$L/.claude/rules/old.md"
echo "hand" > "$L/.cursor/rules/api.mdc"
echo "legacy" > "$L/CLAUDE.md"
check "legacy files block without --force" '! bash "$SCRIPT" "$L" >/dev/null 2>&1'
check "legacy .claude/rules kept" '[ -f "$L/.claude/rules/old.md" ] && [ ! -L "$L/.claude/rules" ]'
check "legacy CLAUDE.md kept" '[ ! -L "$L/CLAUDE.md" ] && grep -q legacy "$L/CLAUDE.md"'
check "--force replaces legacy files with links" 'bash "$SCRIPT" --force "$L" >/dev/null && [ -L "$L/.claude/rules" ] && [ -L "$L/.cursor/rules/api.mdc" ] && [ -L "$L/CLAUDE.md" ]'

echo "sync-rules: errors"
E="$TMPROOT/empty"; mkdir -p "$E"
check "missing .agents/rules exits nonzero" '! bash "$SCRIPT" "$E" >/dev/null 2>&1'
check "unknown flag exits 2" 'set +e; bash "$SCRIPT" --nope >/dev/null 2>&1; [ $? -eq 2 ]; r=$?; set -e; [ $r -eq 0 ]'

echo
echo "sync-rules: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
