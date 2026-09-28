# Parallel Dispatch (shared)

Canonical fan-out rules for skills that spawn multiple subagents. Referenced by autoplan, review, bootstrap, design-shotgun.
Referenced via: SHARED_DIR pattern (CD2).

## Rules

1. **Launch all N together, then wait once.** Independent agents are dispatched as one batch so they run concurrently — never sequentially when there is no data dependency. Per host (see `capabilities.md`):
   - **Claude Code:** one message containing N `Agent` tool calls.
   - **Codex:** N `spawn_agent` calls, then a single `wait_agent` over all returned ids.
   - **Cursor:** one message containing N `Task` tool calls.
2. **Explicit output paths.** Every dispatched agent receives an explicit `--output <absolute path>` (or equivalent instruction naming the exact file it must write). No agent invents its own output location.
3. **Existence-check before consolidation.** The parent verifies each expected output exists and is non-empty before consolidating:

```bash
for f in "${EXPECTED_OUTPUTS[@]}"; do
  [ -s "$f" ] || echo "MISSING OUTPUT: $f"
done
```

4. **Missing output = named failure.** A missing or empty output is reported by name in the consolidated result — never silently skipped and never substituted with invented content.
