import { describe, expect, it } from "vitest";

import { makeRulesProvider } from "../../src/providers/rules.js";

describe("rules provider", () => {
  it("covers every content class", () => {
    const provider = makeRulesProvider();
    for (const cls of ["code", "diff", "brief", "transcript", "message-meta", "image"] as const) {
      expect(provider.classes.has(cls)).toBe(true);
    }
  });

  it("is unavailable when no fallback is configured for the question", async () => {
    const provider = makeRulesProvider();
    const result = await provider.decide({ name: "wake-gate", outputs: ["send"], prompt: "x", contentClass: "message-meta" }, {}, 100);
    expect(result).toEqual({ status: "unavailable", reason_code: "no-rules-fallback-configured" });
  });
});
