import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { main, realDeps, type CliDeps } from "../src/cli.js";
import type { RunSummary } from "../src/publish.js";

const scriptJson = JSON.stringify({ route: "/", role: "staff", viewports: ["desktop"], steps: [{ action: "goto", target: "/", expectedState: { kind: "url-path", path: "/" } }] });
const summary = (status: "passed" | "failed"): RunSummary => ({ steps: [{ name: "s", status, screenshot: "x.png" }], visual: "unchanged", visualReasons: [], lintFindings: [] });

function deps(over: Partial<CliDeps> = {}): { d: CliDeps; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, d: { run: async () => summary("passed"), readFile: () => scriptJson, out: (l) => out.push(l), err: (l) => err.push(l), ...over } };
}

describe("cli main", () => {
  it("runs the script, prints the summary and exits 0 when every step passed", async () => {
    const run = vi.fn().mockResolvedValue(summary("passed"));
    const { d, out } = deps({ run });
    expect(await main(["s.json", "/runs/r1", "--baseline", "b.png", "--app-build", "abc", "--fixtures", "seed1", "--cache", "m.json"], d)).toBe(0);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ route: "/" }), "/runs/r1", "b.png", { appBuild: "abc", fixtures: "seed1", cacheManifest: "m.json", scriptSha256: createHash("sha256").update(scriptJson).digest("hex") });
    expect(JSON.parse(out[0]!).visual).toBe("unchanged");
  });

  it("exits 2 (still printing the summary) when a step failed", async () => {
    const { d, out } = deps({ run: async () => summary("failed") });
    expect(await main(["s.json", "/runs/r1"], d)).toBe(2);
    expect(out).toHaveLength(1);
  });

  it("exits 1 with usage on missing args, an unknown flag, or a flag without a value", async () => {
    for (const argv of [[], ["s.json"], ["s.json", "r", "--nope", "x"], ["s.json", "r", "--baseline"]]) {
      const { d, err } = deps();
      expect(await main(argv, d)).toBe(1);
      expect(err[0]).toContain("usage:");
    }
  });

  it("exits 1 when the script file is unreadable or not JSON", async () => {
    const unreadable = deps({ readFile: () => { throw new Error("ENOENT"); } });
    expect(await main(["s.json", "r"], unreadable.d)).toBe(1);
    expect(unreadable.err[0]).toContain("ENOENT");
    expect(await main(["s.json", "r"], deps({ readFile: () => "{nope" }).d)).toBe(1);
  });

  it("exits 1 without running anything when the script fails schema validation (e.g. prose expectedState)", async () => {
    const run = vi.fn();
    const bad = JSON.stringify({ route: "/", role: "staff", viewports: ["desktop"], steps: [{ action: "goto", target: "/", expectedState: "looks fine" }] });
    const { d, err } = deps({ run, readFile: () => bad });
    expect(await main(["s.json", "r"], d)).toBe(1);
    expect(run).not.toHaveBeenCalled();
    expect(err[0]).toContain("invalid script");
  });

  it("realDeps wires real fs and console", () => {
    const d = realDeps(async () => summary("passed"));
    expect(() => d.readFile("/nonexistent/x.json")).toThrow();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    d.out("o");
    d.err("e");
    expect(log).toHaveBeenCalledWith("o");
    expect(error).toHaveBeenCalledWith("e");
  });
});
