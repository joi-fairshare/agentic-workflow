import { describe, expect, it } from "vitest";

import { parseLine } from "../src/transcript/parse-line.js";
import { assistant, prLink, user } from "./helpers.js";

const TS = "2026-09-26T10:00:00.000Z";

describe("parseLine", () => {
  it("flags a line that is not JSON", () => {
    expect(parseLine("{nope")).toEqual({ lineType: null, jsonError: true, assistantWithoutUsage: false, records: [] });
  });

  it("returns a null type for JSON that is not a typed object", () => {
    expect(parseLine("42").lineType).toBeNull();
    expect(parseLine("null").lineType).toBeNull();
    expect(parseLine('{"type":7}').lineType).toBeNull();
  });

  it("ignores known non-record line types", () => {
    expect(parseLine('{"type":"ai-title","sessionId":"s1","aiTitle":"x"}')).toEqual({ lineType: "ai-title", jsonError: false, assistantWithoutUsage: false, records: [] });
  });

  it("turns an assistant line into a call", () => {
    const out = parseLine(assistant({ id: "m1", ts: TS, input: 2, cacheRead: 100, cacheCreation: 50, output: 7 }));
    expect(out.records).toEqual([{ t: "call", messageId: "m1", sessionId: "s1", ts: TS, model: "claude-opus-5-5", input: 2, cacheRead: 100, cacheCreation: 50, output: 7 }]);
  });

  it("defaults missing cache and output counts to zero", () => {
    const line = JSON.stringify({ type: "assistant", uuid: "u", sessionId: "s1", timestamp: TS, message: { id: "m", model: "x", usage: { input_tokens: 3 } } });
    expect(parseLine(line).records).toEqual([{ t: "call", messageId: "m", sessionId: "s1", ts: TS, model: "x", input: 3, cacheRead: 0, cacheCreation: 0, output: 0 }]);
  });

  it("flags an assistant line with no usage", () => {
    const line = JSON.stringify({ type: "assistant", uuid: "u", sessionId: "s1", timestamp: TS, message: { id: "m", model: "x" } });
    expect(parseLine(line)).toMatchObject({ assistantWithoutUsage: true, records: [] });
  });

  it("skips synthetic assistant lines without flagging them", () => {
    const line = JSON.stringify({ type: "assistant", uuid: "u", sessionId: "s1", timestamp: TS, message: { model: "<synthetic>", content: [] } });
    expect(parseLine(line)).toMatchObject({ assistantWithoutUsage: false, records: [] });
  });

  it("turns a the user string prompt into an event", () => {
    expect(parseLine(user("build it", { ts: TS, uuid: "u1" })).records).toEqual([{ t: "event", uuid: "u1", sessionId: "s1", ts: TS, kind: "user_prompt", detail: null }]);
  });

  it("maps every user text kind to an event kind", () => {
    const kind = (text: string) => parseLine(user(text, { ts: TS })).records.map((r) => (r.t === "event" ? r.kind : r.t));
    expect(kind("continue")).toEqual(["user_continue"]);
    expect(kind("no, not that")).toEqual(["user_correction"]);
    expect(kind("[Request interrupted by user]")).toEqual(["interrupt"]);
    expect(kind('<teammate-message teammate_id="a">{"type":"idle_notification"}</teammate-message>')).toEqual(["wake_idle"]);
    expect(kind('<teammate-message teammate_id="a">{"type":"shutdown_request"}</teammate-message>')).toEqual(["wake_terminate"]);
    expect(kind('<teammate-message teammate_id="a">done</teammate-message>')).toEqual(["wake_text"]);
    expect(kind("<system-reminder>x</system-reminder>")).toEqual([]);
  });

  it("keeps the teammate id as the event detail", () => {
    const [r] = parseLine(user('<teammate-message teammate_id="fix-2">done</teammate-message>', { ts: TS })).records;
    expect(r).toMatchObject({ kind: "wake_text", detail: "fix-2" });
  });

  it("joins text blocks of an array prompt", () => {
    const out = parseLine(user([{ type: "text", text: "build" }, { type: "text", text: "it" }], { ts: TS }));
    expect(out.records).toMatchObject([{ t: "event", kind: "user_prompt" }]);
  });

  it("never counts sidechain or meta lines as the user", () => {
    expect(parseLine(user("build it", { ts: TS, sidechain: true })).records).toEqual([]);
    expect(parseLine(user("build it", { ts: TS, meta: true })).records).toEqual([]);
  });

  it("does not treat tool results as prompts (RF-4)", () => {
    const out = parseLine(user([
      { type: "tool_result", tool_use_id: "t1", content: "build it" },
      { type: "tool_result", tool_use_id: "t2", content: [{ type: "text", text: "continue" }, { type: "image" }], is_error: true },
      { type: "tool_result", tool_use_id: "t3" },
      { type: "tool_result" },
    ], { ts: TS, uuid: "u9" }));
    expect(out.records).toEqual([]);
  });

  it("counts an interrupt that arrives as a tool result, as text or as blocks", () => {
    const kinds = (content: unknown) => parseLine(user([{ type: "tool_result", tool_use_id: "t1", content }], { ts: TS })).records.map((r) => (r.t === "event" ? r.kind : r.t));
    expect(kinds("[Request interrupted by user for tool use]")).toEqual(["interrupt"]);
    expect(kinds([{ type: "text", text: "[Request interrupted by user for tool use]" }])).toEqual(["interrupt"]);
  });

  it("ignores a malformed user line", () => {
    expect(parseLine('{"type":"user","sessionId":"s1"}').records).toEqual([]);
  });

  it("turns a pr-link line into a PR record", () => {
    expect(parseLine(prLink({ number: 1234, ts: TS })).records).toEqual([{ t: "pr", sessionId: "s1", ts: TS, repo: "acme/web-app", number: 1234 }]);
  });

  it("ignores a malformed pr-link line", () => {
    expect(parseLine('{"type":"pr-link","sessionId":"s1"}').records).toEqual([]);
  });

  it("parses a hook_additional_context attachment into a startup_ctx record, summing content array chars", () => {
    const line = JSON.stringify({
      type: "attachment", uuid: "u1", sessionId: "s1", timestamp: TS,
      attachment: { type: "hook_additional_context", content: ["a".repeat(100), "b".repeat(50)], hookName: "SessionStart", hookEvent: "SessionStart" },
    });
    const outcome = parseLine(line);
    expect(outcome.records).toEqual([{ t: "startup_ctx", uuid: "u1", sessionId: "s1", ts: TS, category: "hook_context", source: "SessionStart", chars: 150 }]);
  });

  it("ignores every unhandled attachment.type", () => {
    const line = JSON.stringify({
      type: "attachment", uuid: "u2", sessionId: "s1", timestamp: TS,
      attachment: { type: "environment", content: "x".repeat(1000) },
    });
    expect(parseLine(line).records).toEqual([]);
  });

  it("ignores a malformed attachment line", () => {
    expect(parseLine('{"type":"attachment","sessionId":"s1"}').records).toEqual([]);
  });

  it("handles a hook_additional_context attachment whose content is a single string, not an array (defensive — real shape not confirmed in every case)", () => {
    const line = JSON.stringify({
      type: "attachment", uuid: "u3", sessionId: "s1", timestamp: TS,
      attachment: { type: "hook_additional_context", content: "c".repeat(40), hookName: "SessionStart", hookEvent: "SessionStart" },
    });
    expect(parseLine(line).records).toEqual([{ t: "startup_ctx", uuid: "u3", sessionId: "s1", ts: TS, category: "hook_context", source: "SessionStart", chars: 40 }]);
  });

  it("RF-7: a skill_listing with isInitial=false is NOT counted as startup", () => {
    const line = JSON.stringify({
      type: "attachment", uuid: "u10", sessionId: "s1", timestamp: TS,
      attachment: { type: "skill_listing", content: "x".repeat(500), skillCount: 3, isInitial: false, names: ["a", "b", "c"] },
    });
    expect(parseLine(line).records).toEqual([]);
  });

  it("parses an initial skill_listing into a startup_ctx record, category=skill_listing, source='catalog'", () => {
    const line = JSON.stringify({
      type: "attachment", uuid: "u11", sessionId: "s1", timestamp: TS,
      attachment: { type: "skill_listing", content: "x".repeat(30000), skillCount: 150, isInitial: true, names: Array(150).fill("skill") },
    });
    expect(parseLine(line).records).toEqual([{ t: "startup_ctx", uuid: "u11", sessionId: "s1", ts: TS, category: "skill_listing", source: "catalog", chars: 30000 }]);
  });

  it("parses an instructions attachment into one startup_ctx record per file, source = home-relative path", () => {
    const line = JSON.stringify({
      type: "attachment", uuid: "u12", sessionId: "s1", timestamp: TS,
      attachment: { type: "instructions", files: [
        { path: `${process.env.HOME}/.claude/CLAUDE.md`, type: "User", content: "a".repeat(4123) },
        { path: `${process.env.HOME}/acme/web-app/CLAUDE.md`, type: "Project", content: "b".repeat(1000) },
        { path: `${process.env.HOME}/.claude/projects/-Users-dev-acme-web-app/memory/MEMORY.md`, type: "AutoMem", content: "c".repeat(7587) },
      ] },
    });
    const records = parseLine(line).records;
    expect(records).toContainEqual({ t: "startup_ctx", uuid: "u12", sessionId: "s1", ts: TS, category: "instructions", source: "~/.claude/CLAUDE.md", chars: 4123 });
    expect(records).toContainEqual({ t: "startup_ctx", uuid: "u12", sessionId: "s1", ts: TS, category: "instructions", source: "~/acme/web-app/CLAUDE.md", chars: 1000 });
    expect(records.length).toBe(3);
  });

  it("leaves a path outside $HOME unchanged in an instructions record's source", () => {
    const line = JSON.stringify({
      type: "attachment", uuid: "u12b", sessionId: "s1", timestamp: TS,
      attachment: { type: "instructions", files: [{ path: "/etc/some-other-place/CLAUDE.md", type: "Project", content: "x".repeat(10) }] },
    });
    expect(parseLine(line).records).toEqual([{ t: "startup_ctx", uuid: "u12b", sessionId: "s1", ts: TS, category: "instructions", source: "/etc/some-other-place/CLAUDE.md", chars: 10 }]);
  });

  it("leaves a path unchanged when $HOME is unset in the environment", () => {
    const prevHome = process.env.HOME;
    delete process.env.HOME;
    try {
      const line = JSON.stringify({
        type: "attachment", uuid: "u12c", sessionId: "s1", timestamp: TS,
        attachment: { type: "instructions", files: [{ path: "/Users/dev/.claude/CLAUDE.md", type: "User", content: "x".repeat(5) }] },
      });
      expect(parseLine(line).records).toEqual([{ t: "startup_ctx", uuid: "u12c", sessionId: "s1", ts: TS, category: "instructions", source: "/Users/dev/.claude/CLAUDE.md", chars: 5 }]);
    } finally {
      if (prevHome !== undefined) process.env.HOME = prevHome;
    }
  });

  it("parses an mcp_instructions_delta into one startup_ctx record per server, zipping addedNames with addedBlocks", () => {
    const line = JSON.stringify({
      type: "attachment", uuid: "u13", sessionId: "s1", timestamp: TS,
      attachment: { type: "mcp_instructions_delta", addedNames: ["prism-mcp", "claude.ai Figma"], addedBlocks: ["x".repeat(2074), "y".repeat(2080)], removedNames: [] },
    });
    const records = parseLine(line).records;
    expect(records).toContainEqual({ t: "startup_ctx", uuid: "u13", sessionId: "s1", ts: TS, category: "mcp_instructions", source: "prism-mcp", chars: 2074 });
    expect(records).toContainEqual({ t: "startup_ctx", uuid: "u13", sessionId: "s1", ts: TS, category: "mcp_instructions", source: "claude.ai Figma", chars: 2080 });
  });

  it("parses a deferred_tools_delta into one startup_ctx record per MCP server, chars = sum of matching addedLines lengths", () => {
    const line = JSON.stringify({
      type: "attachment", uuid: "u20", sessionId: "s1", timestamp: TS,
      attachment: {
        type: "deferred_tools_delta",
        addedNames: ["mcp__acme__grep_code", "mcp__acme__git_log", "mcp__prism-mcp__session_bootstrap", "ArtifactComments"],
        addedLines: ["x".repeat(20), "x".repeat(5), "y".repeat(10), "z".repeat(5)],
        removedNames: [], wireHiddenNames: [], readdedNames: [], pendingMcpServers: [], failedMcpServers: [], surfacedNames: [],
      },
    });
    const records = parseLine(line).records;
    expect(records).toContainEqual({ t: "startup_ctx", uuid: "u20", sessionId: "s1", ts: TS, category: "deferred_tools", source: "acme", chars: 25 });
    expect(records).toContainEqual({ t: "startup_ctx", uuid: "u20", sessionId: "s1", ts: TS, category: "deferred_tools", source: "prism-mcp", chars: 10 });
    expect(records).toContainEqual({ t: "startup_ctx", uuid: "u20", sessionId: "s1", ts: TS, category: "deferred_tools", source: "builtin", chars: 5 });
    expect(records.length).toBe(3);
  });

  it("ignores a deferred_tools_delta with mismatched addedNames/addedLines lengths rather than guessing pairings", () => {
    const line = JSON.stringify({
      type: "attachment", uuid: "u21", sessionId: "s1", timestamp: TS,
      attachment: { type: "deferred_tools_delta", addedNames: ["mcp__acme__grep_code"], addedLines: ["x".repeat(10), "y".repeat(10)] },
    });
    expect(parseLine(line).records).toEqual([]);
  });

  it("ignores a mismatched addedNames/addedBlocks length rather than guessing pairings", () => {
    const line = JSON.stringify({
      type: "attachment", uuid: "u14", sessionId: "s1", timestamp: TS,
      attachment: { type: "mcp_instructions_delta", addedNames: ["prism-mcp"], addedBlocks: ["x".repeat(10), "y".repeat(10)], removedNames: [] },
    });
    expect(parseLine(line).records).toEqual([]);
  });
});
