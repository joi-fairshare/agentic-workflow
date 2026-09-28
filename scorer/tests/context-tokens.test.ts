import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { estimateCurrentContextTokens } from "../src/context-tokens.js";

function writeTranscript(lines: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "context-tokens-"));
  const file = path.join(dir, "transcript.jsonl");
  fs.writeFileSync(file, lines.join("\n"));
  return file;
}

const assistantLine = (id: string, ts: string, input: number, cacheRead: number, cacheCreation: number) =>
  JSON.stringify({
    type: "assistant",
    sessionId: "s1",
    timestamp: ts,
    message: { id, model: "claude-sonnet-5", usage: { input_tokens: input, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheCreation, output_tokens: 12 } },
  });

describe("estimateCurrentContextTokens", () => {
  it("returns null when the file doesn't exist (RF-1)", () => {
    expect(estimateCurrentContextTokens("/tmp/does-not-exist-" + Date.now() + ".jsonl")).toBeNull();
  });

  it("returns null for an empty file", () => {
    expect(estimateCurrentContextTokens(writeTranscript([]))).toBeNull();
  });

  it("returns null when no line parses as a call record", () => {
    const file = writeTranscript(["not json at all", JSON.stringify({ type: "user", sessionId: "s1", timestamp: "t", uuid: "u", message: { content: "hi" } })]);
    expect(estimateCurrentContextTokens(file)).toBeNull();
  });

  it("sums input + cache_read + cache_creation for the single call", () => {
    const file = writeTranscript([assistantLine("m1", "2026-09-27T00:00:00.000Z", 1000, 50_000, 2_000)]);
    expect(estimateCurrentContextTokens(file)).toBe(53_000);
  });

  it("uses the LAST call record in file order, not the largest or the first", () => {
    const file = writeTranscript([
      assistantLine("m1", "2026-09-27T00:00:00.000Z", 1000, 300_000, 0), // largest, but not last
      assistantLine("m2", "2026-09-27T00:01:00.000Z", 500, 10_000, 0), // last — this one wins
    ]);
    expect(estimateCurrentContextTokens(file)).toBe(10_500);
  });

  it("skips a torn (unparseable) final line and uses the last complete call before it (RF-2)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "context-tokens-"));
    const file = path.join(dir, "transcript.jsonl");
    const complete = assistantLine("m1", "2026-09-27T00:00:00.000Z", 500, 20_000, 0);
    fs.writeFileSync(file, complete + "\n" + '{"type":"assistant","sessionId":"s1","timestamp":"2026-09-27T00:01:00.000Z","mess');
    expect(estimateCurrentContextTokens(file)).toBe(20_500);
  });

  it("treats missing cache fields as zero", () => {
    const file = writeTranscript([JSON.stringify({ type: "assistant", sessionId: "s1", timestamp: "t", message: { id: "m1", model: "x", usage: { input_tokens: 100 } } })]);
    expect(estimateCurrentContextTokens(file)).toBe(100);
  });

  it("reads a Codex rollout's last token_count, and returns null for a Cursor transcript", () => {
    const codexDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "context-tokens-")), ".codex", "sessions", "2026", "09", "27");
    fs.mkdirSync(codexDir, { recursive: true });
    const codexFile = path.join(codexDir, "rollout-x.jsonl");
    const usage = (input: number, cached: number, total: number) => ({ input_tokens: input, cached_input_tokens: cached, output_tokens: 1, total_tokens: total });
    const tc = (input: number, cached: number, total: number) => JSON.stringify({ timestamp: "2026-09-27T00:00:00.000Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: usage(input, cached, total), last_token_usage: usage(input, cached, total) } } });
    fs.writeFileSync(codexFile, [tc(1_000, 900, 1_001), "", tc(4_000, 3_500, 5_002)].join("\n"));
    expect(estimateCurrentContextTokens(codexFile)).toBe(4_000);

    const cursorDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "context-tokens-")), "agent-transcripts", "c1");
    fs.mkdirSync(cursorDir, { recursive: true });
    const cursorFile = path.join(cursorDir, "c1.jsonl");
    fs.writeFileSync(cursorFile, JSON.stringify({ role: "assistant", message: { content: [{ type: "text", text: "hi" }] } }));
    expect(estimateCurrentContextTokens(cursorFile)).toBeNull();
  });

  it("skips a blank line between records", () => {
    const file = writeTranscript([
      assistantLine("m1", "2026-09-27T00:00:00.000Z", 1000, 5_000, 0),
      "",
      assistantLine("m2", "2026-09-27T00:01:00.000Z", 200, 300, 0),
    ]);
    expect(estimateCurrentContextTokens(file)).toBe(500);
  });

  it("ignores non-call records (user turns, pr-link lines) when finding the last call", () => {
    const file = writeTranscript([
      assistantLine("m1", "2026-09-27T00:00:00.000Z", 1000, 5_000, 0),
      JSON.stringify({ type: "user", sessionId: "s1", timestamp: "t2", uuid: "u1", message: { content: "continue" } }),
    ]);
    expect(estimateCurrentContextTokens(file)).toBe(6_000);
  });
});
