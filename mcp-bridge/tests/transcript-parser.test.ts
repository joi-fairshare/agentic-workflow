// mcp-bridge/tests/transcript-parser.test.ts
import { describe, it, expect } from "vitest";
import { parseTranscriptLines, type TranscriptRecord } from "../src/ingestion/transcript-parser.js";

const validLine = (overrides: Partial<TranscriptRecord> = {}): string =>
  JSON.stringify({
    type: "human",
    uuid: "uuid-1",
    parentUuid: null,
    message: { content: "Hello world" },
    timestamp: "2026-03-20T10:00:00Z",
    ...overrides,
  });

describe("parseTranscriptLines", () => {
  it("parses valid JSONL lines", () => {
    const lines = [
      validLine({ uuid: "u1", type: "human" }),
      validLine({ uuid: "u2", type: "assistant", parentUuid: "u1" }),
    ];
    const result = parseTranscriptLines(lines);
    expect(result.records).toHaveLength(2);
    expect(result.records[0].uuid).toBe("u1");
    expect(result.records[1].parentUuid).toBe("u1");
    expect(result.skipped).toBe(0);
  });

  it("skips malformed JSON lines", () => {
    const lines = [
      validLine({ uuid: "u1" }),
      "not valid json {{{",
      validLine({ uuid: "u2" }),
    ];
    const result = parseTranscriptLines(lines);
    expect(result.records).toHaveLength(2);
    expect(result.skipped).toBe(1);
  });

  it("skips lines missing required fields", () => {
    const lines = [
      JSON.stringify({ type: "human" }), // missing uuid
      validLine({ uuid: "u1" }),
    ];
    const result = parseTranscriptLines(lines);
    expect(result.records).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it("extracts text content from message object", () => {
    const lines = [validLine({ uuid: "u1", message: { content: "Test content" } as never })];
    const result = parseTranscriptLines(lines);
    expect(result.records[0].content).toBe("Test content");
  });

  it("handles empty input", () => {
    const result = parseTranscriptLines([]);
    expect(result.records).toHaveLength(0);
    expect(result.skipped).toBe(0);
  });
});
