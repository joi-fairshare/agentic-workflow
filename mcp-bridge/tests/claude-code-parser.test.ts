import { describe, it, expect } from "vitest";
import { parseClaudeCodeSession } from "../src/ingestion/claude-code-parser.js";

const makeUserLine = (uuid: string, parentUuid: string | null, content: string, timestamp = "2026-01-01T00:00:00Z") =>
  JSON.stringify({ type: "user", uuid, parentUuid, message: { role: "user", content }, timestamp, sessionId: "s1", cwd: "/repo", gitBranch: "main", version: "2.1.80", entrypoint: "cli" });

const makeAssistantLine = (uuid: string, parentUuid: string, blocks: unknown[], timestamp = "2026-01-01T00:00:01Z") =>
  JSON.stringify({ type: "assistant", uuid, parentUuid, message: { role: "assistant", content: blocks }, timestamp, sessionId: "s1", cwd: "/repo", gitBranch: "main", version: "2.1.80", entrypoint: "cli" });

const makeProgressLine = (uuid: string, parentUuid: string) =>
  JSON.stringify({ type: "progress", uuid, parentUuid, data: { type: "agent_progress" }, timestamp: "2026-01-01T00:00:02Z", sessionId: "s1" });

const makeSnapshotLine = () =>
  JSON.stringify({ type: "file-history-snapshot", messageId: "m1", snapshot: { messageId: "m1", trackedFileBackups: {}, timestamp: "2026-01-01T00:00:00Z" }, isSnapshotUpdate: false });

describe("parseClaudeCodeSession", () => {
  it("filters out progress, snapshot, and system lines", () => {
    const lines = [
      makeSnapshotLine(),
      makeProgressLine("p1", "u1"),
      makeUserLine("u1", null, "Hello"),
      makeAssistantLine("a1", "u1", [{ type: "text", text: "Hi there" }]),
    ];
    const result = parseClaudeCodeSession(lines);
    expect(result.turns).toHaveLength(1);
    expect(result.skipped).toBe(2); // snapshot + progress
  });

  it("groups human + assistant into turns", () => {
    const lines = [
      makeUserLine("u1", null, "Question 1"),
      makeAssistantLine("a1", "u1", [{ type: "thinking", thinking: "hmm" }, { type: "text", text: "Answer 1" }]),
      makeUserLine("u2", "a1", "Question 2"),
      makeAssistantLine("a2", "u2", [{ type: "text", text: "Answer 2" }]),
    ];
    const result = parseClaudeCodeSession(lines);
    expect(result.turns).toHaveLength(2);
    expect(result.turns[0].human.content).toBe("Question 1");
    expect(result.turns[0].assistant.visibleText).toBe("Answer 1");
    expect(result.turns[0].assistant.hasThinking).toBe(true);
    expect(result.turns[1].human.content).toBe("Question 2");
  });

  it("extracts tool_use blocks from assistant messages", () => {
    const lines = [
      makeUserLine("u1", null, "Read a file"),
      makeAssistantLine("a1", "u1", [
        { type: "text", text: "Let me read that." },
        { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/foo.ts" } },
      ]),
      // tool_result comes as a user message
      JSON.stringify({ type: "user", uuid: "tr1", parentUuid: "a1", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "file contents" }] }, timestamp: "2026-01-01T00:00:02Z", sessionId: "s1", cwd: "/repo" }),
      makeAssistantLine("a2", "tr1", [{ type: "text", text: "Done." }]),
    ];
    const result = parseClaudeCodeSession(lines);
    expect(result.turns).toHaveLength(1); // tool_result + follow-up assistant are same turn
    expect(result.turns[0].assistant.toolUses).toHaveLength(1);
    expect(result.turns[0].assistant.toolUses[0].name).toBe("Read");
  });

  it("detects Agent tool uses as subagent spawns", () => {
    const lines = [
      makeUserLine("u1", null, "Explore the codebase"),
      makeAssistantLine("a1", "u1", [
        { type: "tool_use", id: "t1", name: "Agent", input: { subagent_type: "Explore", description: "Map codebase", prompt: "Find files" } },
      ]),
    ];
    const result = parseClaudeCodeSession(lines);
    expect(result.turns[0].assistant.toolUses[0].isSubagent).toBe(true);
    expect(result.turns[0].assistant.toolUses[0].subagentType).toBe("Explore");
  });

  it("extracts session metadata from first valid line", () => {
    const lines = [
      makeSnapshotLine(),
      makeUserLine("u1", null, "Hello"),
    ];
    const result = parseClaudeCodeSession(lines);
    expect(result.metadata.sessionId).toBe("s1");
    expect(result.metadata.cwd).toBe("/repo");
    expect(result.metadata.gitBranch).toBe("main");
    expect(result.metadata.version).toBe("2.1.80");
    expect(result.metadata.entrypoint).toBe("cli");
  });

  it("skips meta user messages (isMeta: true)", () => {
    const lines = [
      JSON.stringify({ type: "user", uuid: "m1", parentUuid: null, isMeta: true, message: { role: "user", content: "<local-command-caveat>..." }, timestamp: "2026-01-01T00:00:00Z", sessionId: "s1", cwd: "/repo" }),
      makeUserLine("u1", "m1", "Real question"),
      makeAssistantLine("a1", "u1", [{ type: "text", text: "Real answer" }]),
    ];
    const result = parseClaudeCodeSession(lines);
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].human.content).toBe("Real question");
  });
});
