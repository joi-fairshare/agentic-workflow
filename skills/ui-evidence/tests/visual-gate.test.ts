import { describe, expect, it, vi } from "vitest";

import type { DiffResult } from "../src/pixel-diff.js";
import type { ModelInvocation } from "../src/usage.js";
import type { CacheContext, Manifest } from "../src/verdict-cache.js";
import { decideVisual, type GateInput } from "../src/visual-gate.js";

const ctx: CacheContext = { promptVersion: "v1", model: "m", appBuild: "b1", scenario: "s", fixtures: null, viewport: "desktop", browserVersion: "1" };
const same: DiffResult = { changed: false, sizeMismatch: false, diffPixels: 0, totalPixels: 100, diffScore: 0, box: null };
const changed: DiffResult = { changed: true, sizeMismatch: false, diffPixels: 5, totalPixels: 100, diffScore: 0.05, box: { x: 1, y: 1, w: 2, h: 2 } };

function make(over: Partial<GateInput> = {}, manifest: Manifest = {}) {
  const critique = vi.fn().mockResolvedValue({ decision: "looks-right", reasons: [] });
  const recorded: ModelInvocation[] = [];
  const input: GateInput = {
    after: "after.png", baseline: "base.png", hasFailedSteps: false, runId: "r1", ctx, manifest,
    compare: () => same, hash: (f) => `h:${f}`,
    crop: () => ({ after: "crop-a.png", baseline: "crop-b.png" }),
    critique, record: (i) => recorded.push(i), ...over,
  };
  return { input, critique, recorded, manifest };
}

describe("decideVisual", () => {
  it("makes no model call when pixels match the baseline and every step passed", async () => {
    const { input, critique } = make();
    expect(await decideVisual(input)).toMatchObject({ visual: "unchanged", diffScore: 0 });
    expect(critique).not.toHaveBeenCalled();
  });

  it("critiques once, on the cropped region, when pixels changed", async () => {
    const { input, critique } = make({ compare: () => changed });
    const out = await decideVisual(input);
    expect(critique).toHaveBeenCalledTimes(1);
    expect(critique).toHaveBeenCalledWith("crop-a.png", "crop-b.png");
    expect(out).toMatchObject({ visual: "looks-right", diffScore: 0.05 });
  });

  it("critiques full images when the size changed (no crop box)", async () => {
    const { input, critique } = make({ compare: () => ({ ...changed, sizeMismatch: true, box: null }) });
    await decideVisual(input);
    expect(critique).toHaveBeenCalledWith("after.png", "base.png");
  });

  it("still critiques an unchanged image when a step failed (hard failures stay visible)", async () => {
    const { input, critique } = make({ hasFailedSteps: true });
    const out = await decideVisual(input);
    expect(critique).toHaveBeenCalledTimes(1);
    expect(out.visual).toBe("looks-right");
  });

  it("critiques without a baseline and never claims unchanged", async () => {
    const { input, critique } = make({ baseline: null });
    expect(await decideVisual(input)).toMatchObject({ visual: "looks-right", diffScore: null });
    expect(critique).toHaveBeenCalledWith("after.png", null);
  });

  it("falls through to the judge when the pixel compare throws", async () => {
    const { input, critique } = make({ compare: () => { throw new Error("bad png"); } });
    await decideVisual(input);
    expect(critique).toHaveBeenCalledTimes(1);
  });

  it("fails closed to unchecked when the critique yields nothing, and caches nothing", async () => {
    const { input, manifest } = make({ compare: () => changed, critique: vi.fn().mockResolvedValue(null) });
    expect(await decideVisual(input)).toMatchObject({ visual: "unchecked" });
    expect(manifest).toEqual({});
  });

  it("reuses a prior verdict for identical after+baseline pixels and records the hit", async () => {
    const shared: Manifest = {};
    const first = make({ compare: () => changed }, shared);
    first.critique.mockResolvedValue({ decision: "looks-off", reasons: ["misaligned"] });
    await decideVisual(first.input);
    const second = make({ compare: () => changed }, shared);
    const out = await decideVisual(second.input);
    expect(second.critique).not.toHaveBeenCalled();
    expect(out).toMatchObject({ visual: "looks-off", reasons: ["misaligned"] });
    expect(second.recorded).toEqual([{ phase: "visual-critique", model: null, elapsedMs: 0, ok: true, inputTokens: null, outputTokens: null, cacheHit: true }]);
  });

  it.each([
    ["baseline pixels", { hash: (f: string) => (f === "base.png" ? "new" : `h:${f}`) }],
    ["app build", { ctx: { ...ctx, appBuild: "b2" } }],
    ["fixtures", { ctx: { ...ctx, fixtures: "seed-2" } }],
    ["viewport", { ctx: { ...ctx, viewport: "phone" } }],
    ["browser version", { ctx: { ...ctx, browserVersion: "2" } }],
    ["test script", { ctx: { ...ctx, scenario: "s2" } }],
  ] as Array<[string, Partial<GateInput>]>)("invalidates the cached verdict on a changed %s", async (_n, over) => {
    const shared: Manifest = {};
    await decideVisual(make({ compare: () => changed }, shared).input);
    const next = make({ compare: () => changed, ...over }, shared);
    await decideVisual(next.input);
    expect(next.critique).toHaveBeenCalledTimes(1);
  });
});
