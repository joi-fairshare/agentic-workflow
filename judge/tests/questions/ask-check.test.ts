import { describe, expect, it } from "vitest";

import { openDb } from "../../src/db.js";
import { DEFAULT_CONFIG } from "../../src/config.js";
import { evaluate } from "../../src/evaluate.js";
import { askCheck } from "../../src/questions/ask-check.js";
import { fakeProvider } from "../helpers.js";

describe("askCheck", () => {
  it.each(["push the branch", "merge the PR", "delete the file", "force-push to main", "force push to main"])(
    "is 'ask', with zero model calls, when the next step mentions %s (deterministic deny-list pre-rule, never overridable by a model)",
    async (transcriptTail) => {
      const db = openDb(":memory:");
      const called: string[] = [];
      const cli = fakeProvider("claude-cli", ["transcript"], () => {
        called.push("x");
        return { status: "decided", decision: "continue", confidence: 1, reason_code: "model" };
      });
      const result = await evaluate(askCheck, { transcriptTail }, { db, config: DEFAULT_CONFIG, providers: [cli] });
      expect(result).toMatchObject({ decision: "ask", model: "rules" });
      expect(called).toEqual([]);
    },
  );

  it("asks the model chain when nothing on the deny list is mentioned", async () => {
    const db = openDb(":memory:");
    const cli = fakeProvider("claude-cli", ["transcript"], { status: "decided", decision: "continue", confidence: 0.9, reason_code: "model" });
    const result = await evaluate(askCheck, { transcriptTail: "running the next test file per the brief's plan" }, { db, config: DEFAULT_CONFIG, providers: [cli] });
    expect(result).toMatchObject({ decision: "continue" });
  });
});
