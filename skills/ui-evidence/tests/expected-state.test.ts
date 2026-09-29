import { describe, expect, it, vi } from "vitest";

import { assertExpectedState, type AssertablePage } from "../src/expected-state.js";

function fakePage(over: { url?: string; waitFor?: () => Promise<void>; inputValue?: string } = {}): AssertablePage {
  const waitFor = over.waitFor ?? (async () => undefined);
  return {
    url: () => over.url ?? "http://localhost:3000/a/b",
    getByText: () => ({ first: () => ({ waitFor }) }),
    getByTestId: () => ({ waitFor, inputValue: async () => over.inputValue ?? "" }),
  };
}

describe("assertExpectedState", () => {
  it("passes visible/absent/testid when the wait resolves", async () => {
    const waitFor = vi.fn().mockResolvedValue(undefined);
    const page = fakePage({ waitFor });
    await assertExpectedState(page, { kind: "text-visible", text: "x" });
    await assertExpectedState(page, { kind: "text-absent", text: "x" });
    await assertExpectedState(page, { kind: "testid-visible", testId: "t" });
    expect(waitFor).toHaveBeenNthCalledWith(1, { state: "visible", timeout: 3000 });
    expect(waitFor).toHaveBeenNthCalledWith(2, { state: "hidden", timeout: 3000 });
  });
  it("throws when the wait rejects", async () => {
    const page = fakePage({ waitFor: () => Promise.reject(new Error("timeout")) });
    await expect(assertExpectedState(page, { kind: "text-visible", text: "x" })).rejects.toThrow("timeout");
  });
  it("checks url path exactly", async () => {
    await assertExpectedState(fakePage(), { kind: "url-path", path: "/a/b" });
    await expect(assertExpectedState(fakePage(), { kind: "url-path", path: "/other" })).rejects.toThrow("expected url path");
  });
  it("checks input value exactly", async () => {
    await assertExpectedState(fakePage({ inputValue: "hi" }), { kind: "input-value", testId: "t", value: "hi" });
    await expect(assertExpectedState(fakePage({ inputValue: "no" }), { kind: "input-value", testId: "t", value: "hi" })).rejects.toThrow("expected input");
  });
});
