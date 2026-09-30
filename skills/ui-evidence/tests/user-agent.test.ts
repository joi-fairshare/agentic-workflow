import { describe, expect, it } from "vitest";

import { desktopChromeUserAgent } from "../src/user-agent.js";

describe("desktopChromeUserAgent", () => {
  it("presents headless Chromium as the same version of desktop Chrome, without 'Headless'", () => {
    const ua = desktopChromeUserAgent("153.0.8010.12", {});
    expect(ua).toBe("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.12 Safari/537.36");
    expect(ua).not.toMatch(/headless/i);
  });

  it("honours UI_EVIDENCE_USER_AGENT when set", () => {
    expect(desktopChromeUserAgent("153.0.0.0", { UI_EVIDENCE_USER_AGENT: "Custom/1.0" })).toBe("Custom/1.0");
    expect(desktopChromeUserAgent("153.0.0.0", { UI_EVIDENCE_USER_AGENT: " " })).toContain("Chrome/153.0.0.0");
  });
});
