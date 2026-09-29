import { describe, expect, it, vi } from "vitest";

import { openDb } from "../../src/db.js";
import { DEFAULT_CONFIG } from "../../src/config.js";
import { buildChain } from "../../src/chain.js";
import { evaluate } from "../../src/evaluate.js";
import { makeJevProvider } from "../../src/providers/jev.js";
import { visualCritique } from "../../src/questions/visual-critique.js";
import { fakeProvider } from "../helpers.js";

describe("visualCritique", () => {
  it("has no pre-rule — every input reaches the model (this is a judgment call, not a deterministic check)", async () => {
    const db = openDb(":memory:");
    const cli = fakeProvider("claude-cli", ["image"], { status: "decided", decision: "looks-right", confidence: 0.9, reason_code: "model" });
    const result = await evaluate(
      visualCritique,
      { afterScreenshot: "after.png", baselineScreenshot: "main.png", evidenceDir: "/tmp/run1" },
      { db, config: DEFAULT_CONFIG, providers: [cli] },
    );
    expect(result).toMatchObject({ decision: "looks-right" });
  });

  it("builds a prompt naming both screenshots when a baseline is given", () => {
    const prompt = visualCritique.prompt({ afterScreenshot: "after.png", baselineScreenshot: "main.png", evidenceDir: "/tmp/run1" });
    expect(prompt).toContain("after.png");
    expect(prompt).toContain("main.png");
  });

  it("builds a prompt with no baseline mention when baselineScreenshot is null", () => {
    const prompt = visualCritique.prompt({ afterScreenshot: "after.png", baselineScreenshot: null, evidenceDir: "/tmp/run1" });
    expect(prompt).toContain("after.png");
    expect(prompt).not.toContain("main.png");
  });

  it("escalates rather than guessing when the model returns an out-of-enum decision (RF-5)", async () => {
    const db = openDb(":memory:");
    const cli = fakeProvider("claude-cli", ["image"], { status: "decided", decision: "great" as never, confidence: 1, reason_code: "model" });
    const result = await evaluate(visualCritique, { afterScreenshot: "a.png", baselineScreenshot: null, evidenceDir: "/tmp/r" }, { db, config: DEFAULT_CONFIG, providers: [cli] });
    expect(result).toEqual({ escalate: true, reason_code: "no-provider-decided" });
  });
});

describe("visualCritique — provider-neutral contract", () => {
  it("declares reasons as an extra response field and never names a host-specific tool", () => {
    expect(visualCritique.extraProperties).toEqual({ reasons: { type: "array", items: { type: "string" } } });
    const prompt = visualCritique.prompt({ afterScreenshot: "after.png", baselineScreenshot: null, evidenceDir: "/tmp/run1" });
    expect(prompt).not.toContain("Read tool");
  });

  it("never sends an image-class question (or anything derived from it) to Jev, even with Jev enabled and first in the text chain", async () => {
    const db = openDb(":memory:");
    const fetch = vi.fn();
    const jev = makeJevProvider({ fetch, apiKey: async () => "key" });
    const cli = fakeProvider("claude-cli", ["image"], { status: "decided", decision: "looks-off", confidence: 0.9, reason_code: "model" });
    const result = await evaluate(
      visualCritique,
      { afterScreenshot: "after.png", baselineScreenshot: "main.png", evidenceDir: "/tmp/run1" },
      { db, config: DEFAULT_CONFIG, providers: [jev, cli], chain: buildChain({ agentClis: ["claude-cli"], jev: true }) },
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(jev.classes.has("image")).toBe(false);
    expect(result).toMatchObject({ decision: "looks-off" });
  });

  it("escalates (fail closed) instead of falling back to Jev when no image-capable provider is available", async () => {
    const db = openDb(":memory:");
    const fetch = vi.fn();
    const jev = makeJevProvider({ fetch, apiKey: async () => "key" });
    const result = await evaluate(
      visualCritique,
      { afterScreenshot: "after.png", baselineScreenshot: null, evidenceDir: "/tmp/run1" },
      { db, config: DEFAULT_CONFIG, providers: [jev], chain: buildChain({ agentClis: [], jev: true }) },
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("decision");
  });
});
