# iOS Simulator Bootstrap (shared)

Canonical XcodeBuildMCP simulator boot/build/launch sequence and UI-automation capability probe. Referenced by verify-ios, design-verify-ios, design-mockup-ios, verify-app.
Referenced via: SHARED_DIR pattern (CD2).

## Canonical sequence

1. `mcp__xcodebuildmcp__session_show_defaults` — verify active project/workspace, scheme, simulator.
2. If defaults are missing/wrong: `mcp__xcodebuildmcp__discover_projs` → `mcp__xcodebuildmcp__list_schemes`.
3. `mcp__xcodebuildmcp__list_sims` — pick the target simulator.
4. `mcp__xcodebuildmcp__boot_sim` if the simulator is not already Booted.
5. `mcp__xcodebuildmcp__build_run_sim` — or the split path: `mcp__xcodebuildmcp__build_sim` → `mcp__xcodebuildmcp__get_app_bundle_id` → `mcp__xcodebuildmcp__install_app_sim` → `mcp__xcodebuildmcp__launch_app_sim`.
6. Capture with `mcp__xcodebuildmcp__screenshot` (visual) / `mcp__xcodebuildmcp__snapshot_ui` (structural).

## Capability probe (before any gesture step)

Before tap/swipe/type steps, probe whether the UI-automation workflow tools (e.g. `tap`, `swipe`, `type_text`) are available. If absent, print exactly:

"XcodeBuildMCP UI-automation workflow not enabled — see github.com/getsentry/XcodeBuildMCP/docs/CONFIGURATION.md. Interaction steps will be SKIPPED (verdict capped at WARN)."

Then skip interaction steps, record each as SKIPPED with that reason, and cap the run verdict at WARN.

## Simulator lock recipe

Acquire the shared simulator lock in a **single bash invocation** (shell state does not persist between Bash calls):

```bash
LOCK_NAME=ios-sim source "$SHARED_DIR/skill-lock.sh"; acquire_lock
```

- Every per-step failure branch must re-source (`LOCK_NAME=ios-sim source "$SHARED_DIR/skill-lock.sh"`) and call `release_lock` in that same invocation.
- Use `return`, not `exit`, in sourced context — `skill-lock.sh` enables `set -euo pipefail` in the caller's shell.
- Release the lock as the final step of the skill, success or failure.
