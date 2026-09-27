import { describe, expect, it } from "vitest";

import { lintPage, type PageSnapshot } from "../src/lint-page.js";

const base: PageSnapshot = { elements: [], viewport: { w: 1280, h: 800 } };

describe("lintPage", () => {
  it("flags two elements whose bounding boxes overlap", () => {
    const snapshot: PageSnapshot = {
      ...base,
      elements: [
        { selector: "#a", rect: { x: 0, y: 0, w: 100, h: 50 }, text: "A", computedStyle: {}, hasHoverState: true, hasFocusState: true },
        { selector: "#b", rect: { x: 50, y: 20, w: 100, h: 50 }, text: "B", computedStyle: {}, hasHoverState: true, hasFocusState: true },
      ],
    };
    expect(lintPage(snapshot)).toContainEqual(expect.objectContaining({ rule: "overlap" }));
  });

  it("flags an element clipped by the viewport (phone overflow)", () => {
    const snapshot: PageSnapshot = {
      elements: [{ selector: "#c", rect: { x: 0, y: 0, w: 2000, h: 40 }, text: "Wide", computedStyle: {}, hasHoverState: true, hasFocusState: true }],
      viewport: { w: 375, h: 812 },
    };
    expect(lintPage(snapshot)).toContainEqual(expect.objectContaining({ rule: "phone-overflow", selector: "#c" }));
  });

  it("flags a truncated label (ellipsis computed style with a long full text)", () => {
    const snapshot: PageSnapshot = {
      ...base,
      elements: [{ selector: "#d", rect: { x: 0, y: 0, w: 40, h: 20 }, text: "A very long label that clearly does not fit", computedStyle: { textOverflow: "ellipsis" }, hasHoverState: true, hasFocusState: true }],
    };
    expect(lintPage(snapshot)).toContainEqual(expect.objectContaining({ rule: "truncated-label" }));
  });

  it("flags a missing hover/focus state on an interactive-looking element", () => {
    const snapshot: PageSnapshot = {
      ...base,
      elements: [{ selector: "button#save", rect: { x: 0, y: 0, w: 60, h: 30 }, text: "Save", computedStyle: {}, hasHoverState: false, hasFocusState: false }],
    };
    expect(lintPage(snapshot)).toContainEqual(expect.objectContaining({ rule: "missing-hover-focus" }));
  });

  it("flags an element clipped by overflow:hidden with content wider than its own box (distinct from truncated-label, which needs ellipsis)", () => {
    const snapshot: PageSnapshot = {
      ...base,
      elements: [{ selector: "#e", rect: { x: 0, y: 0, w: 30, h: 20 }, text: "This text is much longer than thirty pixels wide", computedStyle: { overflow: "hidden" }, hasHoverState: true, hasFocusState: true }],
    };
    expect(lintPage(snapshot)).toContainEqual(expect.objectContaining({ rule: "clipped", selector: "#e" }));
  });

  it("does not flag clipped when overflow:hidden but the text is short enough to fit", () => {
    const snapshot: PageSnapshot = {
      ...base,
      elements: [{ selector: "#f", rect: { x: 0, y: 0, w: 200, h: 20 }, text: "OK", computedStyle: { overflow: "hidden" }, hasHoverState: true, hasFocusState: true }],
    };
    expect(lintPage(snapshot).find((f) => f.rule === "clipped")).toBeUndefined();
  });

  it("flags a color value not in the allowed token set", () => {
    const snapshot: PageSnapshot = {
      ...base,
      elements: [{ selector: "#g", rect: { x: 0, y: 0, w: 60, h: 30 }, text: "x", computedStyle: { color: "#123456" }, hasHoverState: true, hasFocusState: true }],
    };
    expect(lintPage(snapshot, { allowedColorValues: ["#FFFFFF", "#242525"] })).toContainEqual(expect.objectContaining({ rule: "non-token-value", selector: "#g", detail: expect.stringContaining("#123456") }));
  });

  it("does not flag a color value that is in the allowed token set", () => {
    const snapshot: PageSnapshot = {
      ...base,
      elements: [{ selector: "#h", rect: { x: 0, y: 0, w: 60, h: 30 }, text: "x", computedStyle: { color: "#242525" }, hasHoverState: true, hasFocusState: true }],
    };
    expect(lintPage(snapshot, { allowedColorValues: ["#FFFFFF", "#242525"] })).toEqual([]);
  });

  it("skips the non-token-value check entirely when no allowed set is provided (never a false positive from an unconfigured caller)", () => {
    const snapshot: PageSnapshot = {
      ...base,
      elements: [{ selector: "#i", rect: { x: 0, y: 0, w: 60, h: 30 }, text: "x", computedStyle: { color: "#123456" }, hasHoverState: true, hasFocusState: true }],
    };
    expect(lintPage(snapshot)).toEqual([]);
  });

  it("flags two elements in the same row whose left edges are off by a few pixels (misaligned-edge)", () => {
    const snapshot: PageSnapshot = {
      ...base,
      elements: [
        { selector: "#j", rect: { x: 10, y: 0, w: 60, h: 30 }, text: "A", computedStyle: {}, hasHoverState: true, hasFocusState: true },
        { selector: "#k", rect: { x: 13, y: 40, w: 60, h: 30 }, text: "B", computedStyle: {}, hasHoverState: true, hasFocusState: true },
      ],
    };
    expect(lintPage(snapshot)).toContainEqual(expect.objectContaining({ rule: "misaligned-edge" }));
  });

  it("does not flag misaligned-edge when left edges match exactly", () => {
    const snapshot: PageSnapshot = {
      ...base,
      elements: [
        { selector: "#l", rect: { x: 10, y: 0, w: 60, h: 30 }, text: "A", computedStyle: {}, hasHoverState: true, hasFocusState: true },
        { selector: "#m", rect: { x: 10, y: 40, w: 60, h: 30 }, text: "B", computedStyle: {}, hasHoverState: true, hasFocusState: true },
      ],
    };
    expect(lintPage(snapshot).find((f) => f.rule === "misaligned-edge")).toBeUndefined();
  });

  it("flags an unresolved loading or empty placeholder left on the page", () => {
    const snapshot: PageSnapshot = {
      ...base,
      elements: [{ selector: "#n", rect: { x: 0, y: 0, w: 100, h: 20 }, text: "Loading...", computedStyle: {}, hasHoverState: true, hasFocusState: true }],
    };
    expect(lintPage(snapshot)).toContainEqual(expect.objectContaining({ rule: "unresolved-empty-or-loading", selector: "#n" }));
  });

  it("flags a literal undefined/null/NaN left in rendered text", () => {
    const snapshot: PageSnapshot = {
      ...base,
      elements: [{ selector: "#o", rect: { x: 0, y: 0, w: 100, h: 20 }, text: "Total: undefined", computedStyle: {}, hasHoverState: true, hasFocusState: true }],
    };
    expect(lintPage(snapshot)).toContainEqual(expect.objectContaining({ rule: "unresolved-empty-or-loading", selector: "#o" }));
  });

  it("returns no findings for a clean, non-overlapping, in-viewport page", () => {
    const snapshot: PageSnapshot = {
      elements: [{ selector: "button#save", rect: { x: 10, y: 10, w: 60, h: 30 }, text: "Save", computedStyle: {}, hasHoverState: true, hasFocusState: true }],
      viewport: { w: 1280, h: 800 },
    };
    expect(lintPage(snapshot)).toEqual([]);
  });
});
