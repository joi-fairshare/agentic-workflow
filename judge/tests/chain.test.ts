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

describe("buildChain", () => {
  it("is exactly DEFAULT_CHAIN when only claude-cli is installed and jev is on (existing behavior)", async () => {
    const { buildChain } = await import("../src/chain.js");
    expect(buildChain({ agentClis: ["claude-cli"], jev: true })).toEqual(DEFAULT_CHAIN);
  });

  it("puts jev first on text classes, then the agent CLIs in priority order, then rules; image skips jev", async () => {
    const { buildChain } = await import("../src/chain.js");
    const chain = buildChain({ agentClis: ["codex-cli", "claude-cli", "cursor-cli"], jev: true });
    for (const cls of ["code", "diff", "brief", "transcript", "message-meta"] as const) {
      expect(chain.classes[cls]).toEqual(["jev", "codex-cli", "claude-cli", "cursor-cli", "rules"]);
    }
    expect(chain.classes.image).toEqual(["codex-cli", "claude-cli", "cursor-cli", "rules"]);
  });

  it("drops jev when disabled, and degrades to rules-only with no agent CLIs", async () => {
    const { buildChain } = await import("../src/chain.js");
    expect(buildChain({ agentClis: ["cursor-cli"], jev: false }).classes.code).toEqual(["cursor-cli", "rules"]);
    const bare = buildChain({ agentClis: [], jev: false });
    expect(bare.classes["message-meta"]).toEqual(["rules"]);
    expect(bare.classes.image).toEqual(["rules"]);
  });

  it("routes image to codex-cli and cursor-cli given the REAL providers (their classes include image)", async () => {
    const { buildChain } = await import("../src/chain.js");
    const { makeCodexCliProvider } = await import("../src/providers/codex-cli.js");
    const { makeCursorCliProvider } = await import("../src/providers/cursor-cli.js");
    const codex = makeCodexCliProvider({ spawn: vi.fn(), tmpDirFactory: () => "/tmp/x", writeFile: vi.fn() });
    const cursor = makeCursorCliProvider({ spawn: vi.fn(), tmpDirFactory: () => "/tmp/x" });
    const candidates = providersFor(buildChain({ agentClis: ["cursor-cli", "codex-cli"], jev: true }), "image", [codex, cursor]);
    expect(candidates.map((p) => p.name)).toEqual(["cursor-cli", "codex-cli"]);
  });
});
