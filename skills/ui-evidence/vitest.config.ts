import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // run-script.ts is a real Playwright driver — not unit-testable without
      // a real browser, matching judge/src/cli.ts's precedent (Global
      // Constraints).
      exclude: ["src/run-script.ts", "src/step-exec.ts", "src/bin.ts", "src/pixelmatch.d.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
