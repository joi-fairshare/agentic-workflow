import { describe, expect, it } from "vitest";

import { fallbackNotice } from "../src/notice.js";

describe("fallbackNotice", () => {
  it("names the question and reason, and points at judge why/undo", () => {
    const notice = fallbackNotice("wake-gate", "no-provider-decided");
    expect(notice.systemMessage).toContain("wake-gate");
    expect(notice.systemMessage).toContain("no-provider-decided");
    expect(notice.systemMessage).toContain("judge why");
  });
});
