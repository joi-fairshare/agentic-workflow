import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runJudge } from "../src/judge-exec.js";
import { runVisualCritique } from "../src/visual-critique.js";

const oldPath = process.env.PATH;
let dir: string;

function fakeJudge(body: string): void {
  fs.writeFileSync(path.join(dir, "judge"), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "judge-exec-"));
  process.env.PATH = `${dir}:${oldPath}`;
});
afterAll(() => {
  process.env.PATH = oldPath;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("runJudge", () => {
  it("delivers stdin to the judge process and returns stdout (regression: execFile dropped `input`)", async () => {
    fakeJudge('echo "$1:$(cat)"');
    expect(await runJudge(["q"], "payload", 5000)).toEqual({ stdout: "q:payload\n", code: 0 });
  });

  it("returns a non-zero exit code without throwing", async () => {
    fakeJudge("cat >/dev/null; exit 2");
    expect((await runJudge(["q"], "x", 5000)).code).toBe(2);
  });

  it("does not crash when the judge exits before reading stdin", async () => {
    fakeJudge("exit 0");
    await expect(runJudge(["q"], "x".repeat(1_000_000), 5000)).resolves.toMatchObject({ code: 0 });
  });

  it("rejects on timeout and kills the process", async () => {
    fakeJudge("sleep 5");
    await expect(runJudge(["q"], "x", 100)).rejects.toThrow("timed out");
  });

  it("rejects when the judge binary is missing", async () => {
    const saved = process.env.PATH;
    process.env.PATH = "/nonexistent";
    try {
      await expect(runJudge(["q"], "x", 1000)).rejects.toThrow();
    } finally {
      process.env.PATH = saved;
    }
  });

  it("wires runVisualCritique's default exec through a real subprocess", async () => {
    fakeJudge('cat >/dev/null; echo \'{"decision":"looks-off","reasons":["r"]}\'');
    expect(await runVisualCritique("a.png", null, "/tmp/x")).toEqual({ decision: "looks-off", reasons: ["r"] });
  });
});
