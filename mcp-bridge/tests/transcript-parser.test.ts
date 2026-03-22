// mcp-bridge/tests/transcript-parser.test.ts
import { describe, it, expect } from "vitest";
import { parseTranscriptLines } from "../src/ingestion/transcript-parser.js";

describe("parseTranscriptLines", () => {
  it("parses valid JSONL transcript records", () => {
    const lines = [
      JSON.stringify({ type: "assistant", uuid: "u1", parentUuid: null, message: { content: "Hello" }, timestamp: "2026-01-01T00:00:00Z" }),
      JSON.stringify({ type: "human", uuid: "u2", parentUuid: "u1", message: { content: "Hi" }, timestamp: "2026-01-01T00:01:00Z" }),
    ];
    const result = parseTranscriptLines(lines);
    expect(result.records).toHaveLength(2);
    expect(result.skipped).toBe(0);
    expect(result.records[0].content).toBe("Hello");
    expect(result.records[1].parentUuid).toBe("u1");
  });

  it("skips invalid JSON lines", () => {
    const lines = ["not-json", JSON.stringify({ type: "assistant", uuid: "u1", parentUuid: null, message: { content: "ok" }, timestamp: "2026-01-01T00:00:00Z" })];
    const result = parseTranscriptLines(lines);
    expect(result.records).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it("skips lines that fail Zod validation", () => {
    const lines = [JSON.stringify({ type: "assistant" })]; // missing required uuid field
    const result = parseTranscriptLines(lines);
    expect(result.records).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it("skips empty lines without incrementing skipped count", () => {
    const lines = ["", "  ", JSON.stringify({ type: "assistant", uuid: "u1", parentUuid: null, message: { content: "ok" }, timestamp: "2026-01-01T00:00:00Z" })];
    const result = parseTranscriptLines(lines);
    expect(result.records).toHaveLength(1);
    expect(result.skipped).toBe(0);
  });

  it("extracts content from array-type message content", () => {
    const lines = [
      JSON.stringify({
        type: "assistant", uuid: "u1", parentUuid: null,
        message: { content: [{ type: "text", text: "part1" }, { type: "text", text: "part2" }] },
        timestamp: "2026-01-01T00:00:00Z",
      }),
    ];
    const result = parseTranscriptLines(lines);
    expect(result.records[0].content).toBe("part1\npart2");
  });

  it("returns empty string for missing message field", () => {
    const lines = [
      JSON.stringify({
        type: "assistant", uuid: "u1", parentUuid: null,
        timestamp: "2026-01-01T00:00:00Z",
        // message field omitted
      }),
    ];
    const result = parseTranscriptLines(lines);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].content).toBe("");
  });

  it("extracts content from array with plain string items", () => {
    const lines = [
      JSON.stringify({ type: "human", uuid: "u1", parentUuid: null, message: { content: ["hello", "world"] }, timestamp: "2026-01-01T00:00:00Z" }),
    ];
    const result = parseTranscriptLines(lines);
    expect(result.records[0].content).toBe("hello\nworld");
  });

  it("skips array items that are objects without a text property (returns empty string)", () => {
    const lines = [
      JSON.stringify({
        type: "assistant", uuid: "u1", parentUuid: null,
        message: { content: [{ type: "tool_use", id: "t1" }, { type: "text", text: "hello" }] },
        timestamp: "2026-01-01T00:00:00Z",
      }),
    ];
    const result = parseTranscriptLines(lines);
    // The tool_use item has no "text" field so returns "" and is filtered; only "hello" remains
    expect(result.records[0].content).toBe("hello");
  });

  it("returns empty content when message is present but content is absent", () => {
    const lines = [
      JSON.stringify({ type: "human", uuid: "u2", parentUuid: null, message: {}, timestamp: "2026-01-01T00:00:00Z" }),
    ];
    const result = parseTranscriptLines(lines);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].content).toBe("");
  });
});
