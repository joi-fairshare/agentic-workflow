---
name: ui-evidence
description: Generate Playwright-based UI evidence for a web-app PR — plan with qa-runner, run headless with no model, repair broken selectors via judge, lint for sloppiness, and publish (ask-first) to Linear and a PR comment. Local stack only, never dev/prod.
---

# UI evidence

1. Doctor the stack: `bash scripts/doctor.sh`. Refuse to proceed if unhealthy or foreign (RF-1).
2. **Spawn a subagent** — the `qa-runner` custom agent (installed per provider) — with the PR diff and `verify-web-app`'s route map to write a script (`script-schema.ts`'s shape).
3. `with_stack_lock_and_heavy_job_lock 120 node dist/bin.js <script.json> <run-dir> [--baseline main.png] [--app-build <sha>] [--fixtures <id>] [--cache <manifest.json>]` (exit 0 all steps passed, 2 a step failed/broken, 1 bad usage or invalid script; the summary JSON is printed and written to `<run-dir>/summary.json`, including `appBuild` — pass `--app-build $(git rev-parse HEAD)` so the run is tied to a commit).
4. Check DB provenance (`checkDbProvenance`) before deciding whether Linear upload is even offered.
5. Visual verdict, cheapest first (`visual-gate.ts`): (a) deterministic pixel compare of the last passed screenshot against the approved main baseline — identical pixels and all steps passed ⇒ `unchanged`, **no model call**; (b) verdict cache (`verdict-cache.ts`) keyed on the actual after+baseline image hashes plus prompt/model version, app build, script, fixtures, viewport and browser version — a hit reuses the prior critique and is recorded as a cache hit; (c) otherwise one `judge visual-critique` call on the cropped changed region (image-capable CLI only — Jev is text-only and never sees images). Any failure, timeout, or out-of-enum result is `unchecked` — never a default `looks-right`. A run with a failed/broken step always gets a critique. The browser run and every step check always execute; a cached or `unchanged` visual never stands in for a behavior check.
6. `publishEvidence(...)` — every write asks first, per this repo's policy. Artifact URLs (screenshots, `*-trace.zip`, videos, diff overlay) come only from an approved `uploadArtifact` uploader and only when DB provenance is `seeded`; otherwise evidence stays local paths.

## Step checks and selector repair

Every script step carries a machine-checkable `expectedState` (`text-visible`, `text-absent`, `testid-visible`, `url-path`, `input-value`) asserted after the action. A step whose action works but whose expectation fails is `failed`. A step whose selector is broken (click/fill only) goes to `judge ui-element-repair` with the actual broken target; the judge's chosen index is validated against the currently visible DOM, the same action is executed on that candidate, and the expected state is re-checked — only then is the step `passed`. Two attempts max, then `broken`.

## Cost baseline

Each run writes `summary.json` with every model invocation (planning, selector-repair, visual-critique): elapsed time, and token counts that are `null` (unknown) unless the provider reported them. `scorer` renders per-phase and per-PR/route tables and prints `unknown`, never `0`. To link the planner's single call to its run, add `planning: { pr, model, elapsedMs, inputTokens?, outputTokens? }` to the script. See `docs/ui-evidence-cost.md` for the measurement protocol and status of the planner-model pilot.

## Configuration

These values are deployment-specific and never hardcoded. Set them as
environment variables, or in an uncommitted `.ui-evidence.local.env`
(next to this SKILL.md — see `.gitignore`) that `doctor.sh` sources.

- `UI_EVIDENCE_APP_TITLE` — the app's `<title>` text, used by `doctor.sh` to
  confirm `:3000` is this app and not a foreign process. Required; `doctor.sh`
  fails with a clear message if it's unset and not found in the local config.
- `UI_EVIDENCE_SEED_DOMAINS` — comma-separated list of email domains that
  count as seed/synthetic data for `checkDbProvenance`. Default: `example.com`.
- `UI_EVIDENCE_SEED_EMAIL_PATTERN` — the SQL `LIKE` pattern used to find a
  seed marker row in `public.profile`. Default: a generic example.com pattern.
  Unconfigured, both defaults only match fictional example.com addresses, so
  provenance fails closed ("unknown") against any real database.
- `UI_EVIDENCE_USER_AGENT` — the browser's user agent. Default: desktop Chrome at the
  bundled Chromium's version, because headless Chromium's own UA says "HeadlessChrome"
  and apps that gate on browser support (Vitalize's unsupported-browser page) block it.
