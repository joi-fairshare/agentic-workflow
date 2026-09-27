import { describe, expect, it, vi } from "vitest";

import { DEFAULT_CHAIN, providersFor } from "../src/chain.js";
import { fakeProvider } from "./helpers.js";

describe("providersFor", () => {
  it("returns an empty list for a content class absent from the spec", () => {
    const provider = fakeProvider("claude-cli", ["message-meta"], { status: "unavailable", reason_code: "x" });
    const result = providersFor({ classes: {} }, "message-meta", [provider]);
    expect(result).toEqual([]);
  });

  it("returns providers in DEFAULT_CHAIN's declared order, filtered to those present and covering the class", () => {
    const cli = fakeProvider("claude-cli", ["message-meta"], { status: "unavailable", reason_code: "x" });
    const rules = fakeProvider("rules", ["message-meta"], { status: "unavailable", reason_code: "x" });
    const result = providersFor(DEFAULT_CHAIN, "message-meta", [cli, rules]);
    expect(result.map((p) => p.name)).toEqual(["claude-cli", "rules"]);
  });
});

describe("DEFAULT_CHAIN — image class (review fix #1, BLOCKER)", () => {
  it("routes image to claude-cli given the REAL claude-cli provider (whose classes must include image)", async () => {
    const { makeClaudeCliProvider } = await import("../src/providers/claude-cli.js");
    const { providersFor, DEFAULT_CHAIN } = await import("../src/chain.js");
    const realCli = makeClaudeCliProvider({ spawn: vi.fn(), tmpDirFactory: () => "/tmp/x" });
    const candidates = providersFor(DEFAULT_CHAIN, "image", [realCli]);
    expect(candidates.map((p) => p.name)).toContain("claude-cli");
  });
});
