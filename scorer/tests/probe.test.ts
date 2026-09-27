import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { ProbeLine } from "../src/probe/analyze.js";
import { analyzeProbe, readProbeDir, renderProbe } from "../src/probe/analyze.js";
import { runProbe } from "../src/probe/run-probe.js";
import { tmpDir } from "./helpers.js";

const L = (event: string, input: Record<string, unknown> | null): ProbeLine => ({ ts: "2026-09-27T10:00:00Z", event, input });

describe("analyzeProbe", () => {
  it("answers no-data for an empty probe", () => {
    const f = analyzeProbe([]);
    for (const a of [f.deliveredPromptsReachUserPromptSubmit, f.subagentHooksCarryAgentId, f.subagentHooksSeeParentSession, f.subagentStopFires, f.toolUseIdMatches]) {
      expect(a.verdict).toBe("no-data");
    }
  });

  it("observes every assumption when the inputs support it", () => {
    const f = analyzeProbe([
      L("UserPromptSubmit", { session_id: "p", prompt: "build it" }),
      L("UserPromptSubmit", { session_id: "p", prompt: 'Another Claude session sent a message:\n<teammate-message teammate_id="a">x</teammate-message>' }),
      L("PreToolUse", { session_id: "p", tool_name: "Agent", tool_use_id: "t1" }),
      L("PostToolUse", { session_id: "p", tool_name: "Agent", tool_use_id: "t1" }),
      L("PreToolUse", { session_id: "p", agent_id: "a1", tool_name: "SendMessage", tool_use_id: "t2" }),
      L("Stop", { session_id: "p", agent_id: "a1" }),
      L("SubagentStart", { session_id: "p", agent_id: "a1" }),
      L("TeammateIdle", null),
    ]);
    expect(f.deliveredPromptsReachUserPromptSubmit).toEqual({ verdict: "observed", evidence: "1 of 2 UserPromptSubmit inputs were delivered messages" });
    expect(f.subagentHooksCarryAgentId).toEqual({ verdict: "observed", evidence: "1 of 3 tool-hook inputs carried agent_id" });
    expect(f.subagentHooksSeeParentSession).toEqual({ verdict: "observed", evidence: "1 of 1 agent_id inputs used a main session's session_id" });
    expect(f.subagentStopFires).toEqual({ verdict: "observed", evidence: "1 Stop inputs carried agent_id; 0 SubagentStop inputs" });
    expect(f.toolUseIdMatches).toEqual({ verdict: "observed", evidence: "1 of 2 PreToolUse ids had a matching PostToolUse" });
    expect(f.counts).toMatchObject({ UserPromptSubmit: 2, TeammateIdle: 1 });
    expect(f.keySets.UserPromptSubmit).toEqual({ "prompt,session_id": 2 });
    expect(f.keySets.TeammateIdle).toEqual({ "(null)": 1 });
  });

  it("reports not-observed when the data contradicts an assumption", () => {
    const f = analyzeProbe([
      L("UserPromptSubmit", { session_id: "p", prompt: "hi" }),
      L("PreToolUse", { session_id: "p", tool_name: "Agent", tool_use_id: "t1" }),
      L("PostToolUse", { session_id: "p", tool_name: "Agent", tool_use_id: "zz" }),
      L("PreToolUse", { session_id: "other", agent_id: "a1", tool_name: "Agent" }),
      L("Stop", { session_id: "p" }),
      L("SubagentStop", { session_id: "p", agent_id: "a1" }),
    ]);
    expect(f.deliveredPromptsReachUserPromptSubmit.verdict).toBe("not-observed");
    expect(f.subagentHooksSeeParentSession.verdict).toBe("not-observed");
    expect(f.subagentStopFires).toEqual({ verdict: "not-observed", evidence: "0 Stop inputs carried agent_id; 1 SubagentStop inputs" });
    expect(f.toolUseIdMatches.verdict).toBe("not-observed");
  });

  it("treats a missing prompt field as not delivered", () => {
    const f = analyzeProbe([L("UserPromptSubmit", { session_id: "p" })]);
    expect(f.deliveredPromptsReachUserPromptSubmit).toEqual({ verdict: "not-observed", evidence: "0 of 1 UserPromptSubmit inputs were delivered messages" });
  });

  it("reports not-observed agent ids when tool hooks never carry one", () => {
    const f = analyzeProbe([L("PreToolUse", { session_id: "p", tool_name: "Agent", tool_use_id: "t1" })]);
    expect(f.subagentHooksCarryAgentId.verdict).toBe("not-observed");
    expect(f.subagentHooksSeeParentSession.verdict).toBe("no-data");
  });
});

describe("readProbeDir and runProbe", () => {
  it("reads every probe file, skips bad lines, and writes findings", () => {
    const state = tmpDir();
    const dir = path.join(state, "probe");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "Stop.jsonl"), [
      JSON.stringify({ ts: "t", event: "Stop", input: { session_id: "p" } }),
      "{bad",
      JSON.stringify({ ts: "t", event: "Stop", input: null, parse_error: true }),
      JSON.stringify({ nope: 1 }),
      "",
    ].join("\n"));
    fs.writeFileSync(path.join(dir, "notes.txt"), "x");
    expect(readProbeDir(dir)).toHaveLength(2);
    const md = runProbe(state);
    expect(md).toContain("# Hook-input probe findings");
    expect(md).toContain("| Stop | 2 |");
    expect(fs.readFileSync(path.join(dir, "findings.md"), "utf8")).toBe(md);
  });

  it("handles a missing probe directory", () => {
    expect(readProbeDir(path.join(tmpDir(), "none"))).toEqual([]);
    expect(runProbe(path.join(tmpDir(), "fresh"))).toContain("no-data");
  });
});

describe("renderProbe", () => {
  it("renders each question with its verdict", () => {
    const md = renderProbe(analyzeProbe([L("UserPromptSubmit", { prompt: "hi", session_id: "p" })]));
    expect(md).toContain("| 1. UserPromptSubmit fires for delivered messages | not-observed | 0 of 1 UserPromptSubmit inputs were delivered messages |");
    expect(md).toContain("`prompt,session_id` ×1");
  });
});
