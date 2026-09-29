import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { openDb as openJudgeDb, recordDecision } from "../../judge/src/db.js";
import type { CliOptions } from "../src/args.js";
import { resolveJudgeDbPath, resolveProviders, runReport, transcriptRoot } from "../src/run.js";
import { assistant, prLink, tmpDir, user, writeLines } from "./helpers.js";

const NOW = new Date("2026-09-26T12:00:00.000Z");

function setup(lines: string[]): CliOptions {
  const root = tmpDir();
  writeLines(path.join(root, "projects", "proj", "s1.jsonl"), lines);
  return { command: "report", since: new Date("2026-09-25T12:00:00.000Z"), until: NOW, projectsDir: path.join(root, "projects"), codexSessionsDir: path.join(root, "codex"), cursorProjectsDir: path.join(root, "cursor"), providers: ["claude"], stateDir: path.join(root, "state"), stateDirExplicit: false, prLookup: true, contextTokensPath: null };
}

describe("runReport", () => {
  it("ingests, looks up PRs, and writes markdown and JSON reports", async () => {
    const options = setup([
      user("build it", { ts: "2026-09-26T10:00:00.000Z" }),
      assistant({ id: "m1", ts: "2026-09-26T10:00:01.000Z", input: 1000, output: 10 }),
      prLink({ number: 7, ts: "2026-09-26T10:00:02.000Z" }),
    ]);
    const log: string[] = [];
    const result = await runReport(options, { lookup: async () => "MERGED", log: (l) => log.push(l) });
    expect(result.status).toBe("ok");
    expect(result.markdownPath).toBe(path.join(options.stateDir, "scorer", "reports", "2026-09-26.md"));
    expect(fs.readFileSync(result.markdownPath, "utf8")).toContain("| Tokens per merged PR | 1.0k |");
    const json = JSON.parse(fs.readFileSync(result.jsonPath, "utf8"));
    expect(json.metrics.cost.prsMerged).toBe(1);
    expect(json.verdict.status).toBe("ok");
    expect(log).toEqual(["scorer: 1 files, 3 new lines, 1 PR states looked up", `scorer: wrote ${result.markdownPath}`]);
  });

  it("ingests Claude, Codex, and Cursor transcripts into one report with a provider table", async () => {
    const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
    const options: CliOptions = {
      ...setup([user("build it", { ts: "2026-09-26T10:00:00.000Z" }), assistant({ id: "m1", ts: "2026-09-26T10:00:01.000Z", input: 1000, output: 10 })]),
      codexSessionsDir: path.join(fixtures, "codex", "sessions"),
      cursorProjectsDir: path.join(fixtures, "cursor", "projects"),
      providers: null,
    };
    const result = await runReport(options, { lookup: async () => "MERGED", log: () => undefined });
    expect(result.status).toBe("ok");
    const json = JSON.parse(fs.readFileSync(result.jsonPath, "utf8"));
    expect(json.metrics.providers).toEqual(["claude", "codex", "cursor"]);
    expect(json.metrics.byProvider.map((p: { provider: string; calls: number; prompts: number }) => [p.provider, p.calls, p.prompts])).toEqual([["claude", 1, 1], ["codex", 3, 3], ["cursor", 0, 3]]);
    expect(json.health.byProvider).toEqual({ claude: { files: 1, lines: 2 }, codex: expect.objectContaining({ files: 2 }), cursor: expect.objectContaining({ files: 2 }) });
    const md = fs.readFileSync(result.markdownPath, "utf8");
    expect(md).toContain("| cursor | 1 | n/a | n/a | n/a | n/a | 3 | 1 | 1 |");
  });

  it("is incremental across runs", async () => {
    const options = setup([assistant({ id: "m1", ts: "2026-09-26T10:00:01.000Z" })]);
    const deps = { lookup: async () => "MERGED" as const, log: () => undefined };
    await runReport(options, deps);
    expect((await runReport(options, deps)).status).toBe("no-new-data");
  });

  it("skips PR lookups when disabled", async () => {
    const options = { ...setup([prLink({ number: 7, ts: "2026-09-26T10:00:02.000Z" })]), prLookup: false };
    let asked = 0;
    await runReport(options, { lookup: async () => { asked++; return "MERGED"; }, log: () => undefined });
    expect(asked).toBe(0);
  });

  it("reports an unknown format", async () => {
    const options = setup([JSON.stringify({ type: "assistant", sessionId: "s1", timestamp: "2026-09-26T10:00:00.000Z", message: { id: "m", model: "x" } })]);
    const result = await runReport(options, { lookup: async () => "MERGED", log: () => undefined });
    expect(result.status).toBe("unknown-format");
    expect(fs.readFileSync(result.markdownPath, "utf8")).toContain("UNKNOWN TRANSCRIPT FORMAT");
  });

  it("includes the Judge section from a scratch judgeDbPath, never the real ~/.agentic-workflow/judge", async () => {
    const options = setup([assistant({ id: "m1", ts: "2026-09-26T10:00:01.000Z" })]);
    const judgeDbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "judge-run-")), "decisions.sqlite");
    const jdb = openJudgeDb(judgeDbPath);
    recordDecision(jdb, {
      id: "d1", ts: "2026-09-26T10:00:00.000Z", question: "wake-gate", content_class: "message-meta",
      provider: "rules", decision: "drop", confidence: 1, reason_code: "pre-rule", latency_ms: 0,
      input_digest: "x", undone_at: null, chain_position: 0, skipped: [], outcome: "decided",
    });
    jdb.close();
    const result = await runReport(options, { lookup: async () => "MERGED", log: () => undefined, judgeDbPath });
    const markdown = fs.readFileSync(result.markdownPath, "utf8");
    expect(markdown).toContain("## Judge");
    expect(markdown).toContain("wake-gate");
  });

  it("still produces a report when judgeDbPath points at a directory that doesn't exist (guard, not a throw)", async () => {
    const options = setup([assistant({ id: "m1", ts: "2026-09-26T10:00:01.000Z" })]);
    const judgeDbPath = path.join(os.tmpdir(), "judge-run-missing-" + Date.now(), "decisions.sqlite");
    const result = await runReport(options, { lookup: async () => "MERGED", log: () => undefined, judgeDbPath });
    expect(fs.readFileSync(result.markdownPath, "utf8")).toContain("No judge decisions recorded yet.");
  });

  it("without a judgeDbPath override, reads AW_STATE_DIR's judge db instead of the real ~/.agentic-workflow", async () => {
    const options = setup([assistant({ id: "m1", ts: "2026-09-26T10:00:01.000Z" })]);
    const scratchStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "judge-aw-state-"));
    fs.mkdirSync(path.join(scratchStateDir, "judge"), { recursive: true });
    const jdb = openJudgeDb(path.join(scratchStateDir, "judge", "decisions.sqlite"));
    recordDecision(jdb, {
      id: "d1", ts: "2026-09-26T10:00:00.000Z", question: "wake-gate", content_class: "message-meta",
      provider: "rules", decision: "drop", confidence: 1, reason_code: "pre-rule", latency_ms: 0,
      input_digest: "x", undone_at: null, chain_position: 0, skipped: [], outcome: "decided",
    });
    jdb.close();
    const originalAwStateDir = process.env.AW_STATE_DIR;
    process.env.AW_STATE_DIR = scratchStateDir;
    try {
      const result = await runReport(options, { lookup: async () => "MERGED", log: () => undefined });
      expect(fs.readFileSync(result.markdownPath, "utf8")).toContain("wake-gate");
    } finally {
      if (originalAwStateDir === undefined) delete process.env.AW_STATE_DIR;
      else process.env.AW_STATE_DIR = originalAwStateDir;
    }
  });
});

describe("resolveJudgeDbPath", () => {
  const base: CliOptions = {
    command: "report", since: NOW, until: NOW, projectsDir: "/p", stateDir: "/default/state", stateDirExplicit: false, prLookup: true, contextTokensPath: null,
  };

  it("uses the default state dir when neither --state-dir nor AW_STATE_DIR is set", () => {
    const original = process.env.AW_STATE_DIR;
    delete process.env.AW_STATE_DIR;
    try {
      expect(resolveJudgeDbPath(base)).toBe(path.join("/default/state", "judge", "decisions.sqlite"));
    } finally {
      if (original !== undefined) process.env.AW_STATE_DIR = original;
    }
  });

  it("prefers AW_STATE_DIR over the default when --state-dir was not explicitly passed", () => {
    const original = process.env.AW_STATE_DIR;
    process.env.AW_STATE_DIR = "/env/state";
    try {
      expect(resolveJudgeDbPath(base)).toBe(path.join("/env/state", "judge", "decisions.sqlite"));
    } finally {
      if (original === undefined) delete process.env.AW_STATE_DIR;
      else process.env.AW_STATE_DIR = original;
    }
  });

  it("prefers an explicit --state-dir over AW_STATE_DIR (this was the bug: AW_STATE_DIR used to win unconditionally)", () => {
    const original = process.env.AW_STATE_DIR;
    process.env.AW_STATE_DIR = "/env/state";
    try {
      const options: CliOptions = { ...base, stateDir: "/explicit/state", stateDirExplicit: true };
      expect(resolveJudgeDbPath(options)).toBe(path.join("/explicit/state", "judge", "decisions.sqlite"));
    } finally {
      if (original === undefined) delete process.env.AW_STATE_DIR;
      else process.env.AW_STATE_DIR = original;
    }
  });
});

describe("resolveProviders", () => {
  const base: CliOptions = {
    command: "report", since: NOW, until: NOW, projectsDir: "/claude", codexSessionsDir: "/codex", cursorProjectsDir: "/cursor",
    providers: null, stateDir: "/s", stateDirExplicit: false, prLookup: true, contextTokensPath: null,
  };

  it("maps each provider to its transcript root", () => {
    expect(["claude", "codex", "cursor"].map((p) => transcriptRoot(base, p as "claude" | "codex" | "cursor"))).toEqual(["/claude", "/codex", "/cursor"]);
  });

  it("uses an explicit list as given, else detects by directory, else falls back to all", () => {
    expect(resolveProviders({ ...base, providers: ["cursor"] }, () => false)).toEqual(["cursor"]);
    expect(resolveProviders(base, (p) => p === "/codex")).toEqual(["codex"]);
    expect(resolveProviders(base, () => false)).toEqual(["claude", "codex", "cursor"]);
    expect(resolveProviders({ ...base, projectsDir: path.join(tmpDir(), "none"), codexSessionsDir: tmpDir(), cursorProjectsDir: path.join(tmpDir(), "none") })).toEqual(["codex"]);
  });
});
