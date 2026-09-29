import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { readUiEvidenceRuns } from "../src/ui-evidence-runs.js";

function mkRunDir(base: string, runId: string, summary: unknown): void {
  const dir = path.join(base, runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary));
}

describe("readUiEvidenceRuns", () => {
  it("is empty when the runs directory doesn't exist", () => {
    expect(readUiEvidenceRuns(path.join(os.tmpdir(), "does-not-exist-" + Date.now()))).toEqual([]);
  });

  it("reads one record per run-id subdirectory with a valid summary.json", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "ui-evidence-"));
    mkRunDir(base, "r1", {
      ts: "2026-09-27T00:00:00.000Z",
      steps: [{ name: "goto", status: "passed", screenshot: "/tmp/1.png" }],
      visual: "looks-right",
      visualReasons: [],
      lintFindings: [],
    });
    const runs = readUiEvidenceRuns(base);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ ts: "2026-09-27T00:00:00.000Z", visual: "looks-right" });
  });

  it("skips a run directory whose summary.json is missing", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "ui-evidence-"));
    fs.mkdirSync(path.join(base, "r-empty"));
    expect(readUiEvidenceRuns(base)).toEqual([]);
  });

  it("skips a run directory whose summary.json is malformed JSON", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "ui-evidence-"));
    const dir = path.join(base, "r-bad");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "summary.json"), "not json");
    expect(readUiEvidenceRuns(base)).toEqual([]);
  });

  it("skips a summary.json that doesn't match the expected shape", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "ui-evidence-"));
    mkRunDir(base, "r-shape", { nope: true });
    expect(readUiEvidenceRuns(base)).toEqual([]);
  });

  it("ignores a plain file sitting directly under the runs directory (not a run subdirectory)", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "ui-evidence-"));
    fs.writeFileSync(path.join(base, "stray.txt"), "x");
    expect(readUiEvidenceRuns(base)).toEqual([]);
  });

  it("counts broken steps and an unchecked visual verdict", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "ui-evidence-"));
    mkRunDir(base, "r2", {
      ts: "2026-09-27T01:00:00.000Z",
      steps: [
        { name: "goto", status: "passed", screenshot: "/tmp/1.png" },
        { name: "click Save", status: "broken", screenshot: "/tmp/2.png" },
      ],
      visual: "unchecked",
      visualReasons: [],
      lintFindings: [],
    });
    const [run] = readUiEvidenceRuns(base);
    expect(run.brokenSteps).toBe(1);
    expect(run.visual).toBe("unchecked");
  });

  it("reads pr, route and invocations (usage left unknown as null) from a new-format summary", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "ui-evidence-"));
    mkRunDir(base, "r3", {
      ts: "2026-09-27T02:00:00.000Z",
      steps: [],
      visual: "unchanged",
      visualReasons: [],
      lintFindings: [],
      pr: "42",
      route: "/schedule",
      invocations: [
        { phase: "planning", ok: true, elapsedMs: 1200, inputTokens: null, outputTokens: null },
        { phase: "visual-critique", ok: true, elapsedMs: 0, inputTokens: null, outputTokens: null, cacheHit: true },
      ],
    });
    const [run] = readUiEvidenceRuns(base);
    expect(run).toMatchObject({ pr: "42", route: "/schedule", visual: "unchanged" });
    expect(run.invocations).toEqual([
      { phase: "planning", ok: true, elapsedMs: 1200, inputTokens: null, outputTokens: null, cacheHit: false },
      { phase: "visual-critique", ok: true, elapsedMs: 0, inputTokens: null, outputTokens: null, cacheHit: true },
    ]);
  });

  it("defaults pr, route and invocations for an old-format summary", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "ui-evidence-"));
    mkRunDir(base, "r4", { ts: "2026-09-27T03:00:00.000Z", steps: [], visual: "looks-right", visualReasons: [], lintFindings: [] });
    expect(readUiEvidenceRuns(base)[0]).toMatchObject({ pr: null, route: null, invocations: [] });
  });
});
