import { describe, expect, it } from "vitest";

import { openDb } from "../../src/db.js";
import { DEFAULT_CONFIG } from "../../src/config.js";
import { evaluate } from "../../src/evaluate.js";
import { briefScope } from "../../src/questions/brief-scope.js";
import { fakeProvider } from "../helpers.js";

describe("briefScope", () => {
  it("is missing, with zero model calls, when acceptanceCriteria is empty (RF-1, pre-rule)", async () => {
    const db = openDb(":memory:");
    const called: string[] = [];
    const cli = fakeProvider("claude-cli", ["brief"], () => {
      called.push("x");
      return { status: "decided", decision: "ready", confidence: 1, reason_code: "model" };
    });
    const result = await evaluate(briefScope, { agentType: "lean-coder", goal: "add X", acceptanceCriteria: "", proofCommand: "npm test" }, { db, config: DEFAULT_CONFIG, providers: [cli] });
    expect(result).toMatchObject({ decision: "missing", model: "rules" });
    expect(called).toEqual([]);
  });

  it("is ready, with zero model calls, for an exempt read-only agent type (pre-rule)", async () => {
    const db = openDb(":memory:");
    const cli = fakeProvider("claude-cli", ["brief"], () => {
      throw new Error("must not be called");
    });
    const result = await evaluate(briefScope, { agentType: "Explore", goal: "find X", acceptanceCriteria: "n/a", proofCommand: "n/a" }, { db, config: DEFAULT_CONFIG, providers: [cli] });
    expect(result).toMatchObject({ decision: "ready", model: "rules" });
  });

  it("is ready, with zero model calls, for a skill-internal dispatch (F13, pre-rule)", async () => {
    const db = openDb(":memory:");
    const cli = fakeProvider("claude-cli", ["brief"], () => {
      throw new Error("must not be called");
    });
    const result = await evaluate(briefScope, { agentType: "lean-coder", goal: "", acceptanceCriteria: "", proofCommand: "", skillInternal: true }, { db, config: DEFAULT_CONFIG, providers: [cli] });
    expect(result).toMatchObject({ decision: "ready", model: "rules" });
  });

  it("asks the model chain for a plausible-looking but ambiguous brief", async () => {
    const db = openDb(":memory:");
    const cli = fakeProvider("claude-cli", ["brief"], { status: "decided", decision: "needs_design", confidence: 0.8, reason_code: "model" });
    const result = await evaluate(briefScope, { agentType: "lean-coder", goal: "make it better", acceptanceCriteria: "it's nicer", proofCommand: "n/a" }, { db, config: DEFAULT_CONFIG, providers: [cli] });
    expect(result).toMatchObject({ decision: "needs_design" });
  });
});
