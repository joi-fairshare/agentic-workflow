import { describe, expect, it } from "vitest";

import { openDb } from "../../src/db.js";
import { DEFAULT_CONFIG } from "../../src/config.js";
import { evaluate } from "../../src/evaluate.js";
import { toRef } from "../../src/question.js";
import { uiElementRepair } from "../../src/questions/ui-element-repair.js";
import { fakeProvider } from "../helpers.js";

describe("uiElementRepair", () => {
  it("decides no-good-candidate with zero model calls when there are no candidates (RF-3, pre-rule)", async () => {
    const db = openDb(":memory:");
    const called: string[] = [];
    const cli = fakeProvider("claude-cli", ["code"], () => {
      called.push("called");
      return { status: "decided", decision: "repaired", confidence: 1, reason_code: "model" };
    });
    const result = await evaluate(uiElementRepair, { brokenSelector: "#gone", step: "click Save", candidates: [] }, { db, config: DEFAULT_CONFIG, providers: [cli] });
    expect(result).toMatchObject({ decision: "no-good-candidate", model: "rules" });
    expect(called).toEqual([]);
  });

  it("asks the model chain when candidates exist and accepts an in-enum decision", async () => {
    const db = openDb(":memory:");
    const cli = fakeProvider("claude-cli", ["code"], { status: "decided", decision: "repaired", confidence: 0.9, reason_code: "model" });
    const result = await evaluate(
      uiElementRepair,
      { brokenSelector: "#gone", step: "click Save", candidates: [{ index: 0, role: "button", accessibleName: "Save", testId: null, text: "Save" }] },
      { db, config: DEFAULT_CONFIG, providers: [cli] },
    );
    expect(result).toMatchObject({ decision: "repaired" });
  });

  it("rejects an unconfigured question name gracefully (config re-read per call, per Plan 2)", async () => {
    const db = openDb(":memory:");
    const cli = fakeProvider("claude-cli", ["code"], { status: "decided", decision: "repaired", confidence: 1, reason_code: "model" });
    const config = { questions: { "ui-element-repair": { enabled: false, threshold: 0.7 } } };
    const result = await evaluate(uiElementRepair, { brokenSelector: "#gone", step: "x", candidates: [{ index: 0, role: null, accessibleName: null, testId: null, text: null }] }, { db, config, providers: [cli] });
    expect(result).toEqual({ escalate: true, reason_code: "question-disabled" });
  });

  it("names each candidate and the broken selector in the prompt", () => {
    const prompt = uiElementRepair.prompt({
      brokenSelector: "#save-btn",
      step: "click Save",
      candidates: [{ index: 0, role: "button", accessibleName: "Save", testId: "save", text: "Save" }],
    });
    expect(prompt).toContain("#save-btn");
    expect(prompt).toContain("click Save");
    expect(prompt).toContain("Save");
  });
});

describe("describeCandidate — null fields", () => {
  it("falls back to ? for every null candidate field", () => {
    const prompt = uiElementRepair.prompt({
      brokenSelector: "#gone",
      step: "click Save",
      candidates: [{ index: 0, role: null, accessibleName: null, testId: null, text: null }],
    });
    expect(prompt).toContain("role=? name=? testId=? text=?");
  });
});

describe("uiElementRepair — extra response field", () => {
  it("declares chosenIndex so schema-strict providers (codex-cli) can return it, and toRef passes it through", () => {
    expect(uiElementRepair.extraProperties).toEqual({ chosenIndex: { type: "integer" } });
    const ref = toRef(uiElementRepair, { brokenSelector: "#x", step: "click", candidates: [] });
    expect(ref.extraProperties).toEqual({ chosenIndex: { type: "integer" } });
  });
});
