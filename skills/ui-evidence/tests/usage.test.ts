import { describe, expect, it } from "vitest";

import { timed, type ModelInvocation } from "../src/usage.js";

describe("timed", () => {
  it("records elapsed time with unknown (null) token usage, never zero", async () => {
    const seen: ModelInvocation[] = [];
    let t = 100;
    const out = await timed("selector-repair", (i) => seen.push(i), async () => "x", () => (t += 50));
    expect(out).toBe("x");
    expect(seen).toEqual([{ phase: "selector-repair", model: null, elapsedMs: 50, ok: true, inputTokens: null, outputTokens: null }]);
  });
  it("records ok=false for a null result", async () => {
    const seen: ModelInvocation[] = [];
    await timed("visual-critique", (i) => seen.push(i), async () => null);
    expect(seen[0]?.ok).toBe(false);
  });
  it("still records when the call throws, then rethrows", async () => {
    const seen: ModelInvocation[] = [];
    await expect(timed("planning", (i) => seen.push(i), async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(seen[0]?.ok).toBe(false);
  });
});
