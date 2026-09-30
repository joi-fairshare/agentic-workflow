// End-to-end runScript against the local fixture, with a fake `judge` on PATH
// that counts invocations — proves the clean path makes no image-model call.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runScript } from "../../src/run-script.js";
import type { UiScript } from "../../src/script-schema.js";
import { startFixture } from "./fixture.js";

let fixture: Awaited<ReturnType<typeof startFixture>>;
let tmp: string;
let calls: string;
const oldPath = process.env.PATH;

beforeAll(async () => {
  fixture = await startFixture();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "run-script-"));
  calls = path.join(tmp, "judge-calls.log");
  const bin = path.join(tmp, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "judge"), `#!/bin/sh\necho "$1" >> "${calls}"\ncat > /dev/null\necho '{"decision":"looks-right","reasons":[]}'\n`, { mode: 0o755 });
  process.env.PATH = `${bin}:${oldPath}`;
});
afterAll(async () => {
  process.env.PATH = oldPath;
  await fixture.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const script: UiScript = {
  route: "/",
  role: "staff",
  viewports: ["desktop"],
  planning: { pr: "42", model: "sonnet", elapsedMs: 1200 },
  steps: [
    { action: "goto", target: "/", expectedState: { kind: "text-visible", text: "Schedule" } },
    { action: "click", target: "save-renamed", expectedState: { kind: "text-visible", text: "Saved!" } },
  ],
};
const judgeCalls = (): string[] => (fs.existsSync(calls) ? fs.readFileSync(calls, "utf8").split("\n").filter(Boolean) : []);

describe("runScript", () => {
  it("run 1 (no baseline): critiques once, records every invocation, writes summary + evidence", async () => {
    const dir = path.join(tmp, "run1");
    const s = await runScript(script, dir, undefined, { host: fixture.host, appBuild: "b1", scriptSha256: "h1" });
    expect(s.steps.map((x) => x.status)).toEqual(["passed", "passed"]);
    expect(s.visual).toBe("looks-right");
    expect(judgeCalls()).toEqual(["visual-critique"]);
    expect(s.invocations?.map((i) => i.phase)).toEqual(["planning", "visual-critique"]);
    expect(s.invocations?.[0]).toMatchObject({ model: "sonnet", elapsedMs: 1200, inputTokens: null, outputTokens: null });
    expect(s.pr).toBe("42");
    expect(s.evidence?.traces).toHaveLength(1);
    expect(fs.existsSync(path.join(dir, "summary.json"))).toBe(true);
    // bugfix-state ties a run to a commit through this field.
    expect(JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8")).appBuild).toBe("b1");
    expect(JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8")).scriptSha256).toBe("h1");
  }, 60_000);

  it("run 2 (identical baseline): visual is 'unchanged' with no further image-model call", async () => {
    const baseline = path.join(tmp, "run1", "desktop-2-click.png");
    const before = judgeCalls().length;
    const s = await runScript(script, path.join(tmp, "run2"), baseline, { host: fixture.host, appBuild: "b1" });
    expect(s.visual).toBe("unchanged");
    expect(s.diffScore).toBe(0);
    expect(judgeCalls().length).toBe(before);
    expect(s.invocations?.map((i) => i.phase)).toEqual(["planning"]);
  }, 60_000);

  it("a changed page with a stale baseline critiques once; a reused manifest then hits the cache", async () => {
    const shared = path.join(tmp, "shared-manifest.json");
    const staleBaseline = path.join(tmp, "run1", "desktop-1-goto.png"); // pre-click state differs from post-click
    const before = judgeCalls().length;
    const a = await runScript(script, path.join(tmp, "run3"), staleBaseline, { host: fixture.host, appBuild: "b1", cacheManifest: shared });
    expect(a.visual).toBe("looks-right");
    expect(a.diffScore).toBeGreaterThan(0);
    expect(judgeCalls().length).toBe(before + 1);
    const b = await runScript(script, path.join(tmp, "run4"), staleBaseline, { host: fixture.host, appBuild: "b1", cacheManifest: shared });
    expect(judgeCalls().length).toBe(before + 1); // cache hit: no new call
    expect(b.invocations?.some((i) => i.cacheHit === true)).toBe(true);
    // a new app build invalidates it
    await runScript(script, path.join(tmp, "run5"), staleBaseline, { host: fixture.host, appBuild: "b2", cacheManifest: shared });
    expect(judgeCalls().length).toBe(before + 2);
  }, 120_000);

  it("a behavior failure stays failed even when visuals are cached/unchanged", async () => {
    const failing: UiScript = { ...script, steps: [...script.steps, { action: "click", target: "noop", expectedState: { kind: "text-visible", text: "Never" } }] };
    const s = await runScript(failing, path.join(tmp, "run6"), undefined, { host: fixture.host, appBuild: "b1", cacheManifest: path.join(tmp, "shared-manifest.json") });
    expect(s.steps.at(-1)?.status).toBe("failed");
  }, 60_000);
});
