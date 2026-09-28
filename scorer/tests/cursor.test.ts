import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { openDb } from "../src/db.js";
import { verdict } from "../src/format-health.js";
import { ingestAll } from "../src/ingest.js";
import { createCursorParser, cursorSource, discoverCursorFiles, parseCursorTimestamp } from "../src/transcript/cursor.js";
import type { TranscriptFile } from "../src/transcript/source.js";
import { tmpDir } from "./helpers.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "cursor", "projects");
const C = "c0ffee00-0000-4000-8000-000000000001";
const CS = "c0ffee00-0000-4000-8000-000000000002";

const user = (text: string) => JSON.stringify({ role: "user", message: { content: [{ type: "text", text }] } });

function tmpFile(lines: string[], mtime = new Date("2026-09-20T00:00:00.000Z")): TranscriptFile {
  const p = path.join(tmpDir(), "t.jsonl");
  fs.writeFileSync(p, lines.map((l) => `${l}\n`).join(""));
  fs.utimesSync(p, mtime, mtime);
  return { provider: "cursor", path: p, project: "p", sessionId: "s", agentId: "main", agentType: "main", isMain: true };
}

describe("parseCursorTimestamp", () => {
  it("parses the <timestamp> format with its UTC offset", () => {
    expect(parseCursorTimestamp("Thursday, Sep 3, 2026, 4:45 PM (UTC-7)")).toBe("2026-09-03T23:45:00.000Z");
    expect(parseCursorTimestamp("Monday, Sep 14, 2026, 12:05 AM (UTC+5:30)")).toBe("2026-09-13T18:35:00.000Z");
    expect(parseCursorTimestamp("Sep 14, 2026, 12:05 PM (UTC)")).toBe("2026-09-14T12:05:00.000Z");
  });

  it("returns null for anything else", () => {
    expect(parseCursorTimestamp("yesterday")).toBeNull();
    expect(parseCursorTimestamp("Monday, Foo 14, 2026, 1:05 PM (UTC-7)")).toBeNull();
  });
});

describe("discoverCursorFiles", () => {
  it("finds main and subagent transcripts", () => {
    const files = discoverCursorFiles(FIXTURES).map(({ path: p, ...rest }) => ({ name: path.basename(p), ...rest }));
    expect(files).toEqual([
      { name: `${C}.jsonl`, provider: "cursor", project: "Users-dev-acme-web", sessionId: C, agentId: "main", agentType: "main", isMain: true },
      { name: `${CS}.jsonl`, provider: "cursor", project: "Users-dev-acme-web", sessionId: C, agentId: CS, agentType: "subagent", isMain: false },
    ]);
  });

  it("skips projects without transcripts, sessions without a main file, and non-jsonl subagent files", () => {
    const root = tmpDir();
    fs.mkdirSync(path.join(root, "empty-window"));
    fs.mkdirSync(path.join(root, "p", "agent-transcripts", "s1", "subagents"), { recursive: true });
    fs.writeFileSync(path.join(root, "p", "agent-transcripts", "s1", "subagents", "notes.txt"), "");
    fs.writeFileSync(path.join(root, "p", "agent-transcripts", "s1", "subagents", "x.jsonl"), "");
    fs.mkdirSync(path.join(root, "p", "agent-transcripts", "s2"));
    expect(discoverCursorFiles(root).map((f) => f.agentId)).toEqual(["x"]);
    expect(discoverCursorFiles(path.join(root, "missing"))).toEqual([]);
    expect(cursorSource.provider).toBe("cursor");
  });
});

describe("cursor ingestion (sanitized fixture)", () => {
  it("records human turns and aborts with <timestamp> times and no calls", () => {
    const db = openDb(":memory:");
    const h = ingestAll(db, discoverCursorFiles(FIXTURES));
    expect(db.prepare("SELECT COUNT(*) AS n FROM calls").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT kind, ts, session_id, provider FROM events ORDER BY ts, kind").all()).toEqual([
      { kind: "user_prompt", ts: "2026-09-26T10:00:00.000Z", session_id: C, provider: "cursor" },
      { kind: "interrupt", ts: "2026-09-26T10:05:00.000Z", session_id: C, provider: "cursor" },
      { kind: "user_correction", ts: "2026-09-26T10:05:00.000Z", session_id: C, provider: "cursor" },
      { kind: "user_continue", ts: "2026-09-26T10:07:00.000Z", session_id: C, provider: "cursor" },
    ]);
    const v = verdict(h);
    expect(v.status).toBe("ok");
    expect(v.notices).toEqual([`cursor: ${h.lines} lines read — its transcripts carry no token usage, so it counts toward involvement only, not cost`]);
  });

  it("does not trip the no-assistant-line drift check on a large cursor read", () => {
    const db = openDb(":memory:");
    const lines = Array.from({ length: 250 }, () => JSON.stringify({ role: "assistant", message: { content: [{ type: "text", text: "x" }] } }));
    const h = ingestAll(db, [tmpFile(lines)]);
    expect(h.usageSourceLines).toBe(0);
    expect(verdict(h).status).toBe("ok");
  });
});

describe("createCursorParser", () => {
  it("flags non-JSON and returns a null type for untyped lines", () => {
    const p = createCursorParser(tmpFile([]));
    expect(p.parse("{nope", 0)).toEqual({ lineType: null, jsonError: true, assistantWithoutUsage: false, records: [] });
    expect(p.parse("42", 0).lineType).toBeNull();
    expect(p.parse(JSON.stringify({ foo: 1 }), 0).lineType).toBeNull();
  });

  it("falls back to the file mtime before any <timestamp>, then carries the last one forward", () => {
    const file = tmpFile([]);
    const p = createCursorParser(file);
    expect(p.parse(user("<user_query>first</user_query>"), 0).records).toEqual([{ t: "event", uuid: "off:0", sessionId: "s", ts: "2026-09-20T00:00:00.000Z", kind: "user_prompt", detail: null }]);
    expect(p.parse(JSON.stringify({ type: "turn_ended", status: "aborted" }), 40).records[0]).toMatchObject({ kind: "interrupt", ts: "2026-09-20T00:00:00.000Z" });
    p.parse(user("<timestamp>Sep 21, 2026, 1:00 AM (UTC)</timestamp>"), 80);
    expect(p.parse(JSON.stringify({ type: "turn_ended", status: "aborted" }), 120).records[0]).toMatchObject({ ts: "2026-09-21T01:00:00.000Z" });
    expect(p.parse(user("<timestamp>garbage</timestamp><user_query>again</user_query>"), 160).records[0]).toMatchObject({ ts: "2026-09-21T01:00:00.000Z" });
  });

  it("handles string content, missing user_query, machine-only text, and subagent files", () => {
    const p = createCursorParser(tmpFile([]));
    expect(p.parse(JSON.stringify({ role: "user", message: { content: "plain words" } }), 0).records[0]).toMatchObject({ kind: "user_prompt" });
    expect(p.parse(user("<ide_selection>x</ide_selection>\nfix this"), 0).records[0]).toMatchObject({ kind: "user_prompt" });
    expect(p.parse(user("<timestamp>Sep 21, 2026, 1:00 AM (UTC)</timestamp>"), 0).records).toEqual([]);
    expect(p.parse(user("<user_query>Caveat: generated</user_query>"), 0).records).toEqual([]);
    expect(p.parse(JSON.stringify({ role: "user", message: { content: [{ type: "image" }] } }), 0).records).toEqual([]);
    expect(p.parse(JSON.stringify({ type: "turn_ended", status: "success" }), 0).records).toEqual([]);
    const sub = createCursorParser({ ...tmpFile([]), isMain: false });
    expect(sub.parse(user("<user_query>explore</user_query>"), 0).records).toEqual([]);
    expect(sub.parse(JSON.stringify({ type: "turn_ended", status: "aborted" }), 0).records).toEqual([]);
  });
});
