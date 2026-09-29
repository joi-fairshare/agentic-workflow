import { describe, expect, it } from "vitest";

import { candidateFits, resolveCandidate, type Candidate } from "../src/repair.js";

const c = (index: number, role: string | null = "button"): Candidate => ({ index, role, accessibleName: null, testId: null, text: null });

describe("resolveCandidate", () => {
  const visible = [c(3), c(7, "input")];
  it("returns the chosen visible candidate", () => expect(resolveCandidate({ decision: "repaired", chosenIndex: 7 }, visible)).toEqual(visible[1]));
  it("rejects an index not in the visible DOM", () => expect(resolveCandidate({ decision: "repaired", chosenIndex: 4 }, visible)).toBeNull());
  it("rejects a repaired decision with no index", () => expect(resolveCandidate({ decision: "repaired" }, visible)).toBeNull());
  it("rejects a non-integer index", () => expect(resolveCandidate({ decision: "repaired", chosenIndex: 3.5 }, visible)).toBeNull());
  it("rejects no-good-candidate and a null proposal", () => {
    expect(resolveCandidate({ decision: "no-good-candidate", chosenIndex: 3 }, visible)).toBeNull();
    expect(resolveCandidate(null, visible)).toBeNull();
  });
});

describe("candidateFits", () => {
  it("lets any candidate take a click", () => expect(candidateFits("click", c(0, "div"))).toBe(true));
  it("only fills fillable roles", () => {
    for (const role of ["input", "textbox", "textarea", "searchbox"]) expect(candidateFits("fill", c(0, role))).toBe(true);
    expect(candidateFits("fill", c(0, "button"))).toBe(false);
  });
});
