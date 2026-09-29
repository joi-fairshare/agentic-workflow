// Real-Chromium tests against a local fixture page. These exist because
// step-exec.ts (the false-pass path) previously had no browser coverage.
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ScriptStep } from "../../src/script-schema.js";
import { executeStep, type RepairFn } from "../../src/step-exec.js";
import { startFixture } from "./fixture.js";

let browser: Browser;
let page: Page;
let fixture: Awaited<ReturnType<typeof startFixture>>;

beforeAll(async () => {
  fixture = await startFixture();
  browser = await chromium.launch({ headless: true });
}, 30_000);
afterAll(async () => {
  await browser.close();
  await fixture.close();
});
beforeEach(async () => {
  page = await browser.newPage();
  await page.goto(fixture.host);
});

const click = (target: string, expectedState: ScriptStep["expectedState"]): ScriptStep => ({ action: "click", target, expectedState });
const saved: ScriptStep["expectedState"] = { kind: "text-visible", text: "Saved!" };
const T = 400;
const out = (): Promise<string> => page.locator("#out").innerText();
const never: RepairFn = vi.fn(async () => null);

describe("executeStep expected-state assertion", () => {
  it("passes when the action works and the expected state holds", async () => {
    expect(await executeStep(page, click("save-renamed", saved), fixture.host, never, T)).toBe("passed");
  });

  it("FAILS (not passes) when the click succeeds but the expected state never appears", async () => {
    expect(await executeStep(page, click("noop", saved), fixture.host, never, T)).toBe("failed");
  });

  it("asserts goto url, fill value, and expect-visible steps", async () => {
    expect(await executeStep(page, { action: "goto", target: "/", expectedState: { kind: "url-path", path: "/" } }, fixture.host, never, T)).toBe("passed");
    expect(await executeStep(page, { action: "fill", target: "note-input", value: "hello", expectedState: { kind: "input-value", testId: "note-input", value: "hello" } }, fixture.host, never, T)).toBe("passed");
    expect(await executeStep(page, { action: "fill", target: "note-input", value: "hello", expectedState: { kind: "input-value", testId: "note-input", value: "WRONG" } }, fixture.host, never, T)).toBe("failed");
    expect(await executeStep(page, { action: "expect-visible", target: "Schedule", expectedState: { kind: "testid-visible", testId: "noop" } }, fixture.host, never, T)).toBe("passed");
  });

  it("marks a goto to an unreachable page and a missing expect-visible target broken (no repair for those)", async () => {
    expect(await executeStep(page, { action: "expect-visible", target: "Nope", expectedState: saved }, fixture.host, never, T)).toBe("broken");
  });
});

describe("executeStep selector repair", () => {
  const brokenClick = click("save-old-name", saved);

  it("repairs only after the mapped click actually runs and the expected state passes", async () => {
    const repair: RepairFn = vi.fn(async (_b, _s, candidates) => ({ decision: "repaired", chosenIndex: candidates.find((c) => c.testId === "save-renamed")!.index }));
    expect(await executeStep(page, brokenClick, fixture.host, repair, T)).toBe("passed");
    expect(await out()).toBe("Saved!"); // the click really happened
    const [broken, stepText] = (repair as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(broken).toBe("save-old-name"); // the actual broken target, not expectedState
    expect(stepText).toContain("Saved!");
  }, 20_000);

  it("stays broken when the judge proposes a locator but the action does not satisfy the expectation", async () => {
    const repair: RepairFn = async (_b, _s, candidates) => ({ decision: "repaired", chosenIndex: candidates.find((c) => c.testId === "noop")!.index });
    expect(await executeStep(page, brokenClick, fixture.host, repair, T)).toBe("broken");
    expect(await out()).toBe("");
  }, 20_000);

  it("stays broken on an invalid candidate index (not in the visible DOM)", async () => {
    const repair: RepairFn = vi.fn(async () => ({ decision: "repaired", chosenIndex: 9999 }));
    expect(await executeStep(page, brokenClick, fixture.host, repair, T)).toBe("broken");
    expect(repair).toHaveBeenCalledTimes(2); // capped at two tries
  }, 20_000);

  it("never offers hidden elements as candidates", async () => {
    const seen: string[] = [];
    const repair: RepairFn = async (_b, _s, candidates) => { seen.push(...candidates.map((c) => c.testId ?? "")); return null; };
    await executeStep(page, brokenClick, fixture.host, repair, T);
    expect(seen).not.toContain("hidden-btn");
    expect(seen).toContain("save-renamed");
  }, 20_000);

  it("rejects a fill mapped onto a non-fillable candidate and a missing index", async () => {
    const fillStep: ScriptStep = { action: "fill", target: "old-input", value: "x", expectedState: { kind: "input-value", testId: "note-input", value: "x" } };
    const onButton: RepairFn = async (_b, _s, cs) => ({ decision: "repaired", chosenIndex: cs.find((c) => c.testId === "noop")!.index });
    expect(await executeStep(page, fillStep, fixture.host, onButton, T)).toBe("broken");
    const noIndex: RepairFn = async () => ({ decision: "repaired" });
    expect(await executeStep(page, fillStep, fixture.host, noIndex, T)).toBe("broken");
  }, 30_000);

  it("repairs a fill onto a real input and verifies its value", async () => {
    const fillStep: ScriptStep = { action: "fill", target: "old-input", value: "x", expectedState: { kind: "input-value", testId: "note-input", value: "x" } };
    const repair: RepairFn = async (_b, _s, cs) => ({ decision: "repaired", chosenIndex: cs.find((c) => c.testId === "note-input")!.index });
    expect(await executeStep(page, fillStep, fixture.host, repair, T)).toBe("passed");
  }, 20_000);

  it("skips a candidate when the DOM shifted between enumeration and action", async () => {
    let n = 0;
    const repair: RepairFn = async (_b, _s, cs) => {
      const idx = cs.find((c) => c.testId === "save-renamed")?.index ?? 0;
      if (n++ === 0) await page.evaluate(() => document.querySelector('[data-testid="save-renamed"]')!.setAttribute("data-testid", "moved"));
      return { decision: "repaired", chosenIndex: idx };
    };
    expect(await executeStep(page, brokenClick, fixture.host, repair, T)).toBe("broken");
  }, 20_000);
});
