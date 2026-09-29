import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { realDeps } from "../src/deps.js";
import { readRunEvidence } from "../src/evidence.js";
import { parseHandoff } from "../src/handoff.js";
import { loadState, saveState, stateFile } from "../src/store.js";
import { HANDOFF, makeRepo, tmpDir, writeJson } from "./helpers.js";

describe("readRunEvidence", () => {
  const dir = tmpDir();
  const ui = (steps: string[], appBuild?: string | null) => writeJson(dir, `ui-${steps.join("-")}-${String(appBuild)}.json`, { steps: steps.map((status) => ({ status })), ...(appBuild === undefined ? {} : { appBuild }) });

  it("classifies ui-evidence runs: any failed step is failed, broken-only is broken, else passed", () => {
    expect(readRunEvidence(ui(["passed", "failed", "broken"], "abc"))).toEqual({ kind: "ui-evidence", outcome: "failed", commit: "abc", checkSha256: null, command: null });
    expect(readRunEvidence(ui(["passed", "broken"], "abc"))).toMatchObject({ outcome: "broken" });
    expect(readRunEvidence(ui(["passed"], "abc"))).toMatchObject({ outcome: "passed" });
  });

  it("reports a missing appBuild as a null commit", () => {
    expect(readRunEvidence(ui(["failed"]))).toMatchObject({ commit: null });
    expect(readRunEvidence(ui(["failed"], null))).toMatchObject({ commit: null });
  });

  it("reads run-test results by exit code", () => {
    const base = { kind: "test", command: ["sh", "check.sh"], commit: "c", checkSha256: "h", log: "l" };
    expect(readRunEvidence(writeJson(dir, "t0.json", { ...base, exitCode: 0 }))).toEqual({ kind: "test", outcome: "passed", commit: "c", checkSha256: "h", command: ["sh", "check.sh"] });
    expect(readRunEvidence(writeJson(dir, "t1.json", { ...base, exitCode: 1 }))).toMatchObject({ outcome: "failed" });
  });

  it("rejects unreadable, empty, and unrecognised evidence", () => {
    expect(readRunEvidence(path.join(dir, "missing.json"))).toMatchObject({ error: expect.stringContaining("cannot read") });
    expect(readRunEvidence(ui([]))).toMatchObject({ error: expect.stringContaining("no steps") });
    expect(readRunEvidence(writeJson(dir, "other.json", { hello: 1 }))).toMatchObject({ error: expect.stringContaining("unrecognised") });
  });
});

describe("parseHandoff", () => {
  it("parses status and hypotheses, with backticked or comma-separated files", () => {
    const parsed = parseHandoff(HANDOFF.replace("`src/profile/api.ts`", "src/a.ts, src/b.ts"));
    expect(parsed).toEqual({
      status: "diagnosed",
      hypotheses: [
        { n: 1, text: "PATCH body omits phone", files: ["src/a.ts", "src/b.ts"], likelihood: "High", result: "confirmed" },
        { n: 2, text: "Form state drops phone on blur", files: ["src/profile/Form.tsx", "src/profile/state.ts"], likelihood: "Medium", result: "untested" },
      ],
    });
  });

  it("rejects a handoff without a status line, a hypotheses section, or with a malformed row", () => {
    expect(parseHandoff("## Hypotheses\n")).toEqual({ error: "handoff has no status: line" });
    expect(parseHandoff("status: diagnosed\n")).toEqual({ error: "handoff has no ## Hypotheses section" });
    expect(parseHandoff(HANDOFF.replace("| Medium | untested |", "| Medium | maybe |"))).toMatchObject({ error: expect.stringContaining("malformed hypotheses row") });
  });

  it("parses the handoff template /rootCause --investigate-only documents (contract with skills/rootCause/SKILL.md)", () => {
    const skill = fs.readFileSync(path.join(__dirname, "..", "..", "rootCause", "SKILL.md"), "utf8");
    expect(skill).toContain("--investigate-only");
    const template = skill.slice(skill.indexOf("# Handoff: {slug}"), skill.indexOf("## Ruled Out"));
    const filled = template.replace(/^status: .*$/m, "status: diagnosed").replace("{confirmed/ruled-out/untested}", "confirmed");
    expect(parseHandoff(filled)).toMatchObject({ status: "diagnosed", hypotheses: [{ n: 1, files: ["{file}", "{file}"], result: "confirmed" }] });
  });

  it("returns no hypotheses for an empty table", () => {
    expect(parseHandoff("status: diagnosed\n## Hypotheses\n\n| # | H | F | L | R |\n|---|---|---|---|---|\n\n## Root Cause\nx")).toEqual({ status: "diagnosed", hypotheses: [] });
  });
});

describe("store", () => {
  it("reports a missing or invalid state file", () => {
    const dir = tmpDir();
    expect(loadState(dir)).toMatchObject({ error: expect.stringContaining("run bugfix-state init first") });
    fs.writeFileSync(stateFile(dir), JSON.stringify({ version: 2 }));
    expect(loadState(dir)).toMatchObject({ error: expect.stringContaining("invalid state file") });
  });

  it("creates the state dir and writes atomically", () => {
    const dir = path.join(tmpDir(), "nested", "slug");
    const state = { version: 1 } as unknown as Parameters<typeof saveState>[1];
    saveState(dir, state);
    expect(fs.readdirSync(dir)).toEqual(["state.json"]);
  });
});

describe("realDeps", () => {
  it("runs git, hashes files, and runs commands with output captured to a log", () => {
    const repo = makeRepo();
    const deps = realDeps();
    expect(deps.git(repo, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
    expect(deps.sha256(path.join(repo, "check.sh"))).toMatch(/^[0-9a-f]{64}$/);
    const log = path.join(tmpDir(), "out.log");
    expect(deps.run(["sh", "-c", "echo hi; exit 4"], repo, log)).toBe(4);
    expect(fs.readFileSync(log, "utf8")).toBe("hi\n");
    expect(deps.run(["definitely-not-a-command-xyz"], repo, log)).toBe(1);
    expect(deps.now()).toBeInstanceOf(Date);
  });

  it("looks up judge decisions through the judge binary, null on a non-zero exit or bad JSON", () => {
    const bin = tmpDir();
    const judge = path.join(bin, "judge");
    fs.writeFileSync(judge, '#!/bin/sh\ncase "$2" in\n  ok) echo \'{"question":"resolution-check","decision":"resolved","reason_code":"model","undone_at":null,"ts":"2026-09-29T00:00:00Z"}\';;\n  shape) echo \'{"question":"resolution-check"}\';;\n  bad) echo "not json";;\n  *) exit 1;;\nesac\n');
    fs.chmodSync(judge, 0o755);
    const deps = realDeps(judge);
    expect(deps.judgeWhy("ok")).toEqual({ question: "resolution-check", decision: "resolved", reason_code: "model", undone_at: null, ts: "2026-09-29T00:00:00Z" });
    expect(deps.judgeWhy("shape")).toBeNull();
    expect(deps.judgeWhy("bad")).toBeNull();
    expect(deps.judgeWhy("missing")).toBeNull();
  });
});
