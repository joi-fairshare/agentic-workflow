# Severity & Verdicts (shared)

Canonical severity scale (CD8), verdict enums (CD9), and normalized findings-table schema for all lenses, review, bugReport, and cso.
Referenced via: SHARED_DIR pattern (CD2).

## Severity scale (CD8)

| Severity | Definition |
|---|---|
| CRITICAL | Security issue, data loss, or cannot-ship defect |
| HIGH | Functional defect or unmet requirement |
| MEDIUM | Should fix, non-blocking |
| LOW | Nit / polish |

## Legacy-vocab mapping

| Legacy term | Maps to |
|---|---|
| P0 | CRITICAL |
| P1 | HIGH |
| blocking | CRITICAL or HIGH (reviewer judgment; default HIGH) |
| issue | MEDIUM |
| suggestion / nit | LOW |
| SHIP / ITERATE / RETHINK (productReview) | PASS / NEEDS_WORK / BLOCKED (CD9; flavor may be kept, normalized line is mandatory) |

## Anchored 1–5 rating scale (plan lenses)

Replaces archReview's 1–10; anchors planDesignReview's 1–5.

| Rating | Anchor |
|---|---|
| 5 | No findings above LOW |
| 4 | MEDIUM findings only, all with clear fixes |
| 3 | ≥1 HIGH finding, none structural |
| 2 | Structural HIGH findings — plan section needs rework |
| 1 | CRITICAL finding or the dimension is unaddressed |

## Normalized findings table schema

```markdown
| id | severity | lens | location | finding | recommended fix |
```

An empty findings section contains the literal line `None.`

## Verdict rollup (CD9)

Verification & design-diff verdicts: `PASS / WARN / FAIL`. Plan lenses & autoplan rollup: `PASS / NEEDS_WORK / BLOCKED`.

- Any CRITICAL ⇒ BLOCKED (plan) / FAIL (verification).
- Any HIGH ⇒ NEEDS_WORK (plan) / FAIL (verification failure).
- Only MEDIUM/LOW findings, or lenses skipped-with-reason ⇒ WARN.
- Otherwise ⇒ PASS.

Every lens/review output ends with the required final line:

```
verdict: <PASS|NEEDS_WORK|BLOCKED>
```

(verification skills use `verdict: <PASS|WARN|FAIL>`).
