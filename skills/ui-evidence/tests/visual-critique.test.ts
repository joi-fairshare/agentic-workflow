import { describe, expect, it, vi } from "vitest";

import { runVisualCritique } from "../src/visual-critique.js";

describe("runVisualCritique", () => {
  it("returns the parsed decision and reasons on a clean judge call", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ decision: "looks-off", reasons: ["misaligned save button"] }), code: 0 });
    const result = await runVisualCritique("after.png", "main.png", "/tmp/run1", exec);
    expect(result).toEqual({ decision: "looks-off", reasons: ["misaligned save button"] });
  });

  it("returns null (never a guessed looks-right) when the judge call fails (RF-5)", async () => {
    const exec = vi.fn().mockRejectedValue(new Error("timeout"));
    const result = await runVisualCritique("after.png", null, "/tmp/run1", exec);
    expect(result).toBeNull();
  });

  it("returns null on unparseable stdout", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "not json", code: 0 });
    const result = await runVisualCritique("after.png", null, "/tmp/run1", exec);
    expect(result).toBeNull();
  });

  it("returns null on an out-of-enum decision", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ decision: "great" }), code: 0 });
    const result = await runVisualCritique("after.png", null, "/tmp/run1", exec);
    expect(result).toBeNull();
  });

  it("returns null when the judge call escalates instead of deciding (no decision field)", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ escalate: true, reason_code: "no-provider-decided" }), code: 2 });
    const result = await runVisualCritique("after.png", null, "/tmp/run1", exec);
    expect(result).toBeNull();
  });

  it("defaults reasons to [] when the judge call omits them", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ decision: "looks-right" }), code: 0 });
    const result = await runVisualCritique("after.png", null, "/tmp/run1", exec);
    expect(result).toEqual({ decision: "looks-right", reasons: [] });
  });
});
