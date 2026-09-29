import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { cacheKey, hashJson, loadManifest, lookup, saveManifest, store, type CacheContext } from "../src/verdict-cache.js";

const ctx: CacheContext = { promptVersion: "v1", model: "m", appBuild: "abc", scenario: "s", fixtures: "f", viewport: "desktop", browserVersion: "130" };
const verdict = { decision: "looks-off" as const, reasons: ["r"] };

describe("cacheKey", () => {
  const base = cacheKey("A", "B", ctx);
  it("is stable for identical inputs", () => expect(cacheKey("A", "B", { ...ctx })).toBe(base));
  it.each([
    ["after image", cacheKey("A2", "B", ctx)],
    ["baseline image", cacheKey("A", "B2", ctx)],
    ["missing baseline", cacheKey("A", null, ctx)],
    ["prompt version", cacheKey("A", "B", { ...ctx, promptVersion: "v2" })],
    ["model", cacheKey("A", "B", { ...ctx, model: "n" })],
    ["app build", cacheKey("A", "B", { ...ctx, appBuild: "def" })],
    ["scenario/test script", cacheKey("A", "B", { ...ctx, scenario: "s2" })],
    ["fixtures", cacheKey("A", "B", { ...ctx, fixtures: "f2" })],
    ["viewport", cacheKey("A", "B", { ...ctx, viewport: "phone" })],
    ["browser version", cacheKey("A", "B", { ...ctx, browserVersion: "131" })],
  ])("invalidates on a changed %s", (_n, key) => expect(key).not.toBe(base));
});

describe("manifest", () => {
  it("round-trips through disk and reports a hit for the same key", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vc-")), "m.json");
    const m = loadManifest(file);
    expect(m).toEqual({});
    store(m, "k", verdict, "run1");
    saveManifest(file, m);
    expect(lookup(loadManifest(file), "k", ctx, "run2")).toEqual(verdict);
  });
  it("misses on an unknown key", () => expect(lookup({}, "k", ctx, "r")).toBeNull());
  it("with an unknown app build, trusts an entry only within the run that wrote it", () => {
    const m = {};
    store(m, "k", verdict, "run1");
    const unknown = { ...ctx, appBuild: null };
    expect(lookup(m, "k", unknown, "run1")).toEqual(verdict);
    expect(lookup(m, "k", unknown, "run2")).toBeNull();
  });
  it("tolerates a missing, corrupt or non-object manifest", () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "vc-"));
    fs.writeFileSync(path.join(d, "bad.json"), "{not json");
    fs.writeFileSync(path.join(d, "arr.json"), "[]");
    expect(loadManifest(path.join(d, "bad.json"))).toEqual({});
    expect(loadManifest(path.join(d, "arr.json"))).toEqual({});
  });
  it("hashJson is content-sensitive", () => expect(hashJson({ a: 1 })).not.toBe(hashJson({ a: 2 })));
});
