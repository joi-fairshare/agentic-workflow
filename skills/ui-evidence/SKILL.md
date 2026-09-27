---
name: ui-evidence
description: Generate Playwright-based UI evidence for a web-app PR — plan with qa-runner, run headless with no model, repair broken selectors via judge, lint for sloppiness, and publish (ask-first) to Linear and a PR comment. Local stack only, never dev/prod.
---

# UI evidence

1. Doctor the stack: `bash scripts/doctor.sh`. Refuse to proceed if unhealthy or foreign (RF-1).
2. Dispatch `qa-runner` with the PR diff and `verify-web-app`'s route map to write a script (`script-schema.ts`'s shape).
3. `with_stack_lock_and_heavy_job_lock 120 node dist/run-script.js <script.json> <run-dir>`.
4. Check DB provenance (`checkDbProvenance`) before deciding whether Linear upload is even offered.
5. Visual rubric critique: one Haiku call per run via `judge visual-critique`, reading the run's own after-screenshot (and the main-branch baseline, when captured) through the Read tool with `cwd` set to the run's evidence dir. Falls back to `unchecked` on any failure, timeout, or out-of-enum result — never a default `looks-right`.
6. `publishEvidence(...)` — every write asks first, per this repo's policy.

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
