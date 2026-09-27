#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/../find-duplicate-skills.sh"

FIXTURES="$DIR/fixtures/skill-dedupe"

test_finds_known_14_pairs() {
  local actual
  actual="$(find_duplicate_skills "$FIXTURES/aw-skills.txt" "$FIXTURES/wa-skills.txt" | sort)"
  local expected
  expected="$(cat <<'EOF' | sort
reviewCode	review-code
checkArch	check-arch
huntBugs	hunt-bugs
reportBugs	report-bugs
enhanceQuery	enhance-query
designReviewPlan	design-review-plan
devexReviewPlan	devex-review-plan
reviewProduct	review-product
retroWeekly	retro-weekly
docsSync	docs-sync
specToPr	spec-to-pr
autoplan	autoplan
cso	cso
verify-web	verify-web
EOF
)"
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: expected 14 pairs, got:"
    echo "$actual"
    exit 1
  fi
  echo "PASS: test_finds_known_14_pairs"
}

test_ignores_non_duplicate() {
  # brandkit is aw-only, agentic-workflow is wa-only: neither should appear
  local actual
  actual="$(find_duplicate_skills "$FIXTURES/aw-skills.txt" "$FIXTURES/wa-skills.txt")"
  if echo "$actual" | grep -q "brandkit"; then
    echo "FAIL: brandkit (aw-only) should not be reported as a duplicate"
    exit 1
  fi
  if echo "$actual" | grep -q "agentic-workflow"; then
    echo "FAIL: agentic-workflow (wa-only, no camelCase counterpart) should not be reported"
    exit 1
  fi
  echo "PASS: test_ignores_non_duplicate"
}

test_finds_known_14_pairs
test_ignores_non_duplicate
