# Test Runner Detection (shared)

Canonical test-runner and coverage-tool detection tables. Referenced by shipRelease, bugHunt, bugReport, weeklyRetro.
Referenced via: SHARED_DIR pattern (CD2).

## Test runner → `TEST_CMD`

Detect the project's test runner by checking for project files:

| Check | Runner |
|-------|--------|
| `package.json` exists | `npm test` |
| `pytest.ini`, `pyproject.toml` with `[tool.pytest]`, or `setup.cfg` with `[tool:pytest]` | `pytest` |
| `Cargo.toml` exists | `cargo test` |
| `go.mod` exists | `go test ./...` |
| `Gemfile` exists | `bundle exec rspec` |

Set `TEST_CMD` to the detected command.

## Coverage tooling → `COVERAGE_CMD`

Check for available coverage tooling and run if found:

| Check | Coverage command |
|-------|-----------------|
| `package.json` has `nyc` or `c8` dependency | `npx c8 npm test` or `npx nyc npm test` |
| `package.json` has `vitest` | `npx vitest run --coverage` |
| Python project with `coverage` installed | `coverage run -m pytest && coverage report` |
| `Cargo.toml` with `cargo-tarpaulin` | `cargo tarpaulin` |
| `go.mod` exists | `go test -coverprofile=coverage.out ./... && go tool cover -func=coverage.out` |

Set `COVERAGE_CMD` to the detected command, or leave unset and report "Coverage: not available".

## Scoring rule

**Undetected runners are "n/a — excluded from scoring", never scored as failures.** A repo with no detectable runner reports "n/a" for the test dimension; it does not fail the gate for that reason alone.
