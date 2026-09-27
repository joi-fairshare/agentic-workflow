import { describe, expect, it } from "vitest";

import { parseUiScript } from "../src/script-schema.js";

describe("parseUiScript", () => {
  it("parses a valid script", () => {
    const result = parseUiScript({
      route: "/staff-schedule/my-schedule",
      role: "staff",
      viewports: ["desktop", "phone"],
      steps: [{ action: "goto", target: "/staff-schedule/my-schedule", expectedState: "My Schedule heading visible" }],
    });
    expect(result).not.toHaveProperty("error");
  });

  it("rejects a script with an unknown role", () => {
    const result = parseUiScript({ route: "/x", role: "wizard", viewports: ["desktop"], steps: [] });
    expect(result).toHaveProperty("error");
  });

  it("rejects a script with no viewports", () => {
    const result = parseUiScript({ route: "/x", role: "staff", viewports: [], steps: [{ action: "goto", target: "/x", expectedState: "x" }] });
    expect(result).toHaveProperty("error");
  });

  it("rejects malformed JSON-shaped input entirely (not an object)", () => {
    expect(parseUiScript("not an object")).toHaveProperty("error");
  });
});
