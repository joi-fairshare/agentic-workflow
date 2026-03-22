import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    globals: false,
    environment: "happy-dom",
    setupFiles: ["./__tests__/setup.ts"],
    testTimeout: 10_000,
    alias: {
      "@": resolve(__dirname, "src"),
    },
    coverage: {
      provider: "v8",
      include: ["src/hooks/**/*.ts", "src/lib/**/*.ts"],
      exclude: ["src/lib/types.ts"],
    },
  },
});
