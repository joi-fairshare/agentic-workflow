import { describe, expect, it } from "vitest";

import { parseArgs } from "../src/args.js";

const NOW = new Date("2026-09-26T12:00:00.000Z");
const HOME = "/home/j";

describe("parseArgs", () => {
  it("defaults to a one-day report", () => {
    expect(parseArgs([], NOW, HOME)).toEqual({ ok: true, options: {
      command: "report", since: new Date("2026-09-25T12:00:00.000Z"), until: NOW,
      projectsDir: "/home/j/.claude/projects", codexSessionsDir: "/home/j/.codex/sessions", cursorProjectsDir: "/home/j/.cursor/projects",
      providers: null, stateDir: "/home/j/.agentic-workflow", stateDirExplicit: false, prLookup: true,
      contextTokensPath: null,
    } });
  });

  it("marks stateDirExplicit true only when --state-dir is actually passed", () => {
    const withoutFlag = parseArgs([], NOW, HOME);
    const withFlag = parseArgs(["--state-dir", "/s"], NOW, HOME);
    expect(withoutFlag.ok && withoutFlag.options.stateDirExplicit).toBe(false);
    expect(withFlag.ok && withFlag.options.stateDirExplicit).toBe(true);
  });

  it("accepts relative and absolute --since", () => {
    const r1 = parseArgs(["--since", "7d"], NOW, HOME);
    const r2 = parseArgs(["--since", "6h"], NOW, HOME);
    const r3 = parseArgs(["--since", "2026-09-01"], NOW, HOME);
    expect(r1.ok && r1.options.since.toISOString()).toBe("2026-09-19T12:00:00.000Z");
    expect(r2.ok && r2.options.since.toISOString()).toBe("2026-09-26T06:00:00.000Z");
    expect(r3.ok && r3.options.since.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("accepts the probe command and directory overrides", () => {
    const r = parseArgs(["probe", "--projects-dir", "/p", "--state-dir", "/s", "--no-pr-lookup"], NOW, HOME);
    expect(r).toEqual({ ok: true, options: expect.objectContaining({ command: "probe", projectsDir: "/p", stateDir: "/s", prLookup: false }) });
  });

  it("accepts the context-tokens command with a path", () => {
    const r = parseArgs(["context-tokens", "/tmp/t.jsonl"], NOW, HOME);
    expect(r).toEqual({ ok: true, options: expect.objectContaining({ command: "context-tokens", contextTokensPath: "/tmp/t.jsonl" }) });
  });

  it("accepts --provider (single, list, all) and per-provider directories", () => {
    const one = parseArgs(["--provider", "codex", "--codex-dir", "/c", "--cursor-dir", "/k"], NOW, HOME);
    expect(one).toEqual({ ok: true, options: expect.objectContaining({ providers: ["codex"], codexSessionsDir: "/c", cursorProjectsDir: "/k" }) });
    const list = parseArgs(["--provider", "cursor, claude,cursor"], NOW, HOME);
    expect(list.ok && list.options.providers).toEqual(["cursor", "claude"]);
    const all = parseArgs(["--provider", "all"], NOW, HOME);
    expect(all.ok && all.options.providers).toEqual(["claude", "codex", "cursor"]);
  });

  it.each([
    [["--provider", "gemini"], "--provider must be claude|codex|cursor|all (comma-separated ok): gemini"],
    [["--provider"], "--provider needs a value"],
    [["--since"], "--since needs a value"],
    [["--since", "yesterday"], "--since must be like 7d, 12h or an ISO date: yesterday"],
    [["--since", "2027-01-01"], "--since must be in the past: 2027-01-01"],
    [["--bogus"], "unknown argument: --bogus"],
    [["--projects-dir"], "--projects-dir needs a value"],
    [["context-tokens"], "context-tokens needs a path"],
  ])("rejects %j", (argv, error) => {
    expect(parseArgs(argv, NOW, HOME)).toEqual({ ok: false, error });
  });
});
