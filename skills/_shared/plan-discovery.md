# Plan Discovery (shared)

Canonical newest-plan resolution snippet for autoplan and the 5 plan lenses when no plan path argument is given.
Referenced via: SHARED_DIR pattern (CD2).

Run as **one** bash block:

```bash
source "$SHARED_DIR/repo-slug.sh"
PLAN_DIR=$(ls -1dt "$AW_DIR/plans/"*/ 2>/dev/null | head -1)
if [ -n "$PLAN_DIR" ]; then
  echo "plan dir: $PLAN_DIR"
  ls -1 "$PLAN_DIR"
else
  # Fallback: newest legacy flat plan file
  LEGACY_PLAN=$(ls -1t "$AW_DIR/plans/"*.md 2>/dev/null | head -1)
  echo "legacy plan: ${LEGACY_PLAN:-none}"
fi
```

- If a plan dir is found, resolve files per `_shared/plan-layout.md` (with legacy aliases).
- If both `PLAN_DIR` and `LEGACY_PLAN` are empty: **stop** and ask the user for the plan path — never invent one.
