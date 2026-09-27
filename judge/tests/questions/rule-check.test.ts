import { describe, expect, it } from "vitest";

import { openDb } from "../../src/db.js";
import { DEFAULT_CONFIG } from "../../src/config.js";
import { evaluate } from "../../src/evaluate.js";
import { ruleCheck } from "../../src/questions/rule-check.js";
import { fakeProvider } from "../helpers.js";

describe("ruleCheck", () => {
  it("is n/a, with zero model calls, for an empty hunk (pre-rule)", async () => {
    const db = openDb(":memory:");
    const called: string[] = [];
    const cli = fakeProvider("claude-cli", ["diff"], () => {
      called.push("x");
      return { status: "decided", decision: "fine", confidence: 1, reason_code: "model" };
    });
    const result = await evaluate(ruleCheck, { rule: "no any types", hunk: "" }, { db, config: DEFAULT_CONFIG, providers: [cli] });
    expect(result).toMatchObject({ decision: "n/a", model: "rules" });
    expect(called).toEqual([]);
  });

  it("asks the model chain for a real hunk against a real rule", async () => {
    const db = openDb(":memory:");
    const cli = fakeProvider("claude-cli", ["diff"], { status: "decided", decision: "violated", confidence: 0.9, reason_code: "model" });
    const result = await evaluate(ruleCheck, { rule: "no any types", hunk: "+const x: any = 1;" }, { db, config: DEFAULT_CONFIG, providers: [cli] });
    expect(result).toMatchObject({ decision: "violated" });
  });
});
