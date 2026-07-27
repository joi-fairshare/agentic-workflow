# PR Body Template (shared)

Literal PR-body template with evidence embedding rules (CD13). Referenced by shipRelease and specToProvenPR.
Referenced via: SHARED_DIR pattern (CD2).

```markdown
## Summary
<what changed + why>

## Key decisions
| decision | why |
|---|---|
<≥1 row, or the literal line `None.`>

## Evidence
<embedded evidence.md text: verdict line, journey table, mockup diff %, cross-check raw output>
<artifact paths; with --attach-images: relative links to docs/evidence/<branch>/*.png>

## Tests
<runner used, pass/fail counts>

## Coverage
<overall % or "not available"; list files below 80%>

## Review resolution
<findings found/fixed, number of review runs>
```

## Rules (CD13)

- The `## Evidence` section always embeds the `evidence.md` text (verdict, journey table, cross-check raw output) plus artifact paths — never just a pointer.
- Gate before `gh pr create`: `test -s evidence.md` — an empty/missing evidence file blocks PR creation for user-facing diffs.
- `--attach-images` (specToProvenPR default **on** for user-facing stages; shipRelease default **off**): copy the PNGs to `docs/evidence/<branch>/` on the PR branch, commit them, and reference with relative links.
- A user-facing diff with missing or FAIL evidence ⇒ **no ready PR** — open as draft with a warning checkbox only.
