# Parallel Dispatch (shared)

Canonical fan-out rules for skills that spawn multiple subagents. Referenced by autoplan, review, bootstrap, design-shotgun.
Referenced via: SHARED_DIR pattern (CD2).

## Rules

1. **One message, N Agent calls.** Independent agents are dispatched in a single message with multiple Agent tool uses so they run concurrently — never sequentially when there is no data dependency.
2. **Explicit output paths.** Every dispatched agent receives an explicit `--output <absolute path>` (or equivalent instruction naming the exact file it must write). No agent invents its own output location.
3. **Existence-check before consolidation.** The parent verifies each expected output exists and is non-empty before consolidating:

```bash
for f in "${EXPECTED_OUTPUTS[@]}"; do
  [ -s "$f" ] || echo "MISSING OUTPUT: $f"
done
```

4. **Missing output = named failure.** A missing or empty output is reported by name in the consolidated result — never silently skipped and never substituted with invented content.
