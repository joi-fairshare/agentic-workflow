import { describe, expect, it } from "vitest";

import { describeExpectedState, parseUiScript } from "../src/script-schema.js";

describe("parseUiScript", () => {
  it("parses a valid script", () => {
    const result = parseUiScript({
      route: "/staff-schedule/my-schedule",
      role: "staff",
      viewports: ["desktop", "phone"],
      steps: [{ action: "goto", target: "/staff-schedule/my-schedule", expectedState: { kind: "text-visible", text: "My Schedule" } }],
    });
    expect(result).not.toHaveProperty("error");
  });

  it("rejects a script with an unknown role", () => {
    const result = parseUiScript({ route: "/x", role: "wizard", viewports: ["desktop"], steps: [] });
    expect(result).toHaveProperty("error");
  });

  it("rejects a script with no viewports", () => {
    const result = parseUiScript({ route: "/x", role: "staff", viewports: [], steps: [{ action: "goto", target: "/x", expectedState: { kind: "text-visible", text: "x" } }] });
    expect(result).toHaveProperty("error");
  });

  it("rejects malformed JSON-shaped input entirely (not an object)", () => {
    expect(parseUiScript("not an object")).toHaveProperty("error");
  });

  it("rejects free-form prose as an expectedState (must be machine-checkable)", () => {
    const result = parseUiScript({ route: "/x", role: "staff", viewports: ["desktop"], steps: [{ action: "goto", target: "/x", expectedState: "page looks fine" }] });
    expect(result).toHaveProperty("error");
  });

  it("accepts optional planning provenance with unknown usage left out", () => {
    const result = parseUiScript({ route: "/x", role: "staff", viewports: ["desktop"], planning: { pr: "123", model: "sonnet" }, steps: [{ action: "goto", target: "/x", expectedState: { kind: "url-path", path: "/x" } }] });
    expect(result).not.toHaveProperty("error");
  });

  it("describes every expectedState kind for the repair prompt", () => {
    expect(describeExpectedState({ kind: "text-visible", text: "a" })).toContain("visible");
    expect(describeExpectedState({ kind: "text-absent", text: "a" })).toContain("absent");
    expect(describeExpectedState({ kind: "testid-visible", testId: "t" })).toContain("t");
    expect(describeExpectedState({ kind: "url-path", path: "/p" })).toContain("/p");
    expect(describeExpectedState({ kind: "input-value", testId: "t", value: "v" })).toContain('"v"');
  });
});
