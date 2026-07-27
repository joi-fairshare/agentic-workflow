# Verification Lenses (shared)

Journey primitive and lens catalog for all verification skills: verify-app, verify-web, verify-ios, design-verify-*, specToProvenPR, shipRelease, bugHunt.
Referenced via: SHARED_DIR pattern (CD2).

## Journey primitive

A **journey** is a named, ordered list of steps `{action, target, assertion}` executed **in one browser/simulator session**.

- `action ∈ navigate | click | fill | select | press | wait`
- `assertion` = a concrete expected signal checked after the step (element visible, text present, URL changed, network call succeeded).

**Validity rules:**

1. ≥3 non-navigate (interactive) steps.
2. ≥1 assertion following a state-mutating action (fill/click/select/press that changes app state).
3. A plan of only navigate+snapshot pairs is **rejected** — add interactions, or record `journey: waived — <reason>`. A waiver caps the run verdict at WARN.

## Lens catalog

| Lens | Web binding | iOS binding |
|---|---|---|
| `functional` | journeys via `mcp__plugin_playwright_playwright__browser_navigate/click/fill_form/press_key/select_option`; assert via `browser_snapshot`; `browser_console_messages` clean; `browser_network_requests` no failed calls | journeys via `mcp__xcodebuildmcp__snapshot_ui` (coordinates/labels) + gesture tools when UI-automation enabled (capability probe per `_shared/sim-bootstrap.md`); assert via `snapshot_ui` |
| `visual` | `browser_take_screenshot` per screen×viewport; baseline in screens.json ⇒ `mcp__design-comparison__compare_design`, record diff % (CD11 thresholds: ≤2% PASS, 2–10% WARN, >10% FAIL) | `mcp__xcodebuildmcp__screenshot`; baseline diff same way |
| `accessibility` | `browser_snapshot` tree: labels, roles, heading order, keyboard reachability | `snapshot_ui`: a11y labels/identifiers on interactive elements |
| `error-state` | invalid input / unknown route; assert visible error UI; console shows no uncaught exception | invalid input via journey; assert error UI in snapshot_ui |
| `responsive` (web only) | `browser_resize` to the 3 CD4 viewports (mobile 375×812, tablet 768×1024, desktop 1440×900), re-snapshot each | — |
| `appearance` (iOS only) | — | light + dark, one Dynamic Type step-up; if appearance tools not enabled: `SKIPPED — simulator management workflow not enabled`, verdict capped WARN |

## Defaults

- All applicable lenses run by default; `--lenses <csv>` narrows the set.
- Every lens result lands in `pack.json.lenses[]` (see `_shared/evidence-pack.md`).
- A skipped lens must carry a reason (`reason_if_skipped`) — silent omission is not allowed.
