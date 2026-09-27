import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import type { Db } from "../src/db.js";
import type { TranscriptFile } from "../src/transcript/discover.js";
import { openDb } from "../src/db.js";
import { newHealth } from "../src/format-health.js";
import { ingestAll, ingestFile } from "../src/ingest.js";
import { appendRaw, assistant, hookCtx, prLink, skillListing, tmpDir, user, writeLines } from "./helpers.js";

const TS = "2026-09-26T10:00:00.000Z";
let db: Db;
let file: TranscriptFile;

const count = (table: string): number => (db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n;

beforeEach(() => {
  db = openDb(":memory:");
  const p = path.join(tmpDir(), "proj", "s1.jsonl");
  file = { path: p, project: "proj", sessionId: "s1", agentId: "main", agentType: "main", isMain: true };
});

describe("ingestFile", () => {
  it("stores calls with their agent identity", () => {
    writeLines(file.path, [assistant({ id: "m1", ts: TS, input: 2, cacheRead: 10, cacheCreation: 5, output: 3 })]);
    ingestFile(db, file, newHealth());
    expect(db.prepare("SELECT * FROM calls").all()).toEqual([{
      file: file.path, message_id: "m1", project: "proj", session_id: "s1", agent_id: "main", agent_type: "main", is_main: 1,
      model: "claude-opus-5-5", ts: TS, input: 2, cache_read: 10, cache_creation: 5, output: 3,
    }]);
  });

  it("stores a subagent call with is_main false", () => {
    const sub: TranscriptFile = { ...file, agentId: "a1", agentType: "Explore", isMain: false };
    writeLines(sub.path, [assistant({ id: "m1", ts: TS })]);
    ingestFile(db, sub, newHealth());
    expect(db.prepare("SELECT is_main, agent_type FROM calls").get()).toEqual({ is_main: 0, agent_type: "Explore" });
  });

  it("counts one API response split across lines once, keeping the max output (RF-2)", () => {
    writeLines(file.path, [assistant({ id: "m1", ts: TS, output: 1 }), assistant({ id: "m1", ts: TS, output: 40 }), assistant({ id: "m1", ts: TS, output: 7 })]);
    ingestFile(db, file, newHealth());
    expect(db.prepare("SELECT output FROM calls").all()).toEqual([{ output: 40 }]);
  });

  it("reads only new lines on the next run", () => {
    writeLines(file.path, [assistant({ id: "m1", ts: TS })]);
    const h1 = newHealth();
    ingestFile(db, file, h1);
    appendRaw(file.path, `${assistant({ id: "m2", ts: TS })}\n`);
    const h2 = newHealth();
    ingestFile(db, file, h2);
    expect(count("calls")).toBe(2);
    expect(h2.lines).toBe(1);
  });

  it("does nothing when the file has not grown", () => {
    writeLines(file.path, [assistant({ id: "m1", ts: TS })]);
    ingestFile(db, file, newHealth());
    const h = newHealth();
    ingestFile(db, file, h);
    expect(h.lines).toBe(0);
  });

  it("leaves a partially written last line for the next run (RF-1)", () => {
    const whole = assistant({ id: "m2", ts: TS });
    writeLines(file.path, [assistant({ id: "m1", ts: TS })]);
    appendRaw(file.path, whole.slice(0, 20));
    const h = newHealth();
    ingestFile(db, file, h);
    expect(h).toMatchObject({ lines: 1, jsonErrors: 0 });
    appendRaw(file.path, `${whole.slice(20)}\n`);
    ingestFile(db, file, newHealth());
    expect(count("calls")).toBe(2);
  });

  it("reads nothing from a file with no complete line yet (RF-1)", () => {
    fs.mkdirSync(path.dirname(file.path), { recursive: true });
    fs.writeFileSync(file.path, '{"type":"assi');
    const h = newHealth();
    ingestFile(db, file, h);
    expect(h.lines).toBe(0);
    expect(count("files")).toBe(0);
  });

  it("purges and re-reads a file that shrank (RF-3)", () => {
    writeLines(file.path, [assistant({ id: "m1", ts: TS }), assistant({ id: "m2", ts: TS }), user("hi", { ts: TS }), prLink({ number: 1, ts: TS })]);
    ingestFile(db, file, newHealth());
    writeLines(file.path, [assistant({ id: "m3", ts: TS })]);
    ingestFile(db, file, newHealth());
    expect(db.prepare("SELECT message_id FROM calls").all()).toEqual([{ message_id: "m3" }]);
    expect(count("events")).toBe(0);
    expect(count("pr_links")).toBe(0);
  });

  it("stores startup_ctx records from attachment lines", () => {
    writeLines(file.path, [hookCtx({ uuid: "u1", ts: TS, chars: [100, 50] }), skillListing({ uuid: "u2", ts: TS, chars: 30000 })]);
    ingestFile(db, file, newHealth());
    expect(db.prepare("SELECT uuid, session_id, category, source, chars FROM startup_ctx ORDER BY uuid").all()).toEqual([
      { uuid: "u1", session_id: "s1", category: "hook_context", source: "SessionStart", chars: 150 },
      { uuid: "u2", session_id: "s1", category: "skill_listing", source: "catalog", chars: 30000 },
    ]);
  });

  it("stores the user events and PR links", () => {
    writeLines(file.path, [user("build it", { ts: TS, uuid: "u1" }), prLink({ number: 1234, ts: TS })]);
    ingestFile(db, file, newHealth());
    expect(db.prepare("SELECT kind, session_id, detail FROM events").all()).toEqual([{ kind: "user_prompt", session_id: "s1", detail: null }]);
    expect(db.prepare("SELECT repo, number FROM pr_links").all()).toEqual([{ repo: "acme/web-app", number: 1234 }]);
  });

  it("feeds every line into the health counters", () => {
    writeLines(file.path, [assistant({ id: "m1", ts: TS }), "{bad", '{"type":"ai-title"}']);
    const h = newHealth();
    ingestFile(db, file, h);
    expect(h).toMatchObject({ lines: 3, jsonErrors: 1, assistantLines: 1 });
  });

  it("attributes a subagent file's missing-usage lines to its agent type", () => {
    const sub: TranscriptFile = { ...file, agentId: "a1", agentType: "Explore", isMain: false };
    writeLines(sub.path, [assistant({ id: "m1", ts: TS }), '{"type":"assistant","message":{"model":"x"}}']);
    const h = newHealth();
    ingestFile(db, sub, h);
    expect(h.byAgentType.Explore).toEqual({ assistantLines: 2, assistantWithoutUsage: 1 });
  });
});

describe("ingestAll", () => {
  it("ingests every file and records unreadable ones instead of throwing", () => {
    writeLines(file.path, [assistant({ id: "m1", ts: TS })]);
    const gone: TranscriptFile = { ...file, path: path.join(tmpDir(), "gone.jsonl") };
    const h = ingestAll(db, [file, gone]);
    expect(h.files).toBe(2);
    expect(count("calls")).toBe(1);
    expect(h.readErrors).toHaveLength(1);
    expect(h.readErrors[0]).toContain("gone.jsonl");
  });
});

describe("golden real-shape fixture", () => {
  it("parses every real line shape without format problems", () => {
    const fixture = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures", "real-shapes.jsonl");
    const dir = path.join(tmpDir(), "proj");
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, "f0000000-0000-0000-0000-000000000001.jsonl");
    fs.copyFileSync(fixture, target);
    const h = newHealth();
    ingestFile(db, { ...file, path: target, sessionId: "f0000000-0000-0000-0000-000000000001" }, h);
    expect(h).toMatchObject({ lines: 7, jsonErrors: 0, assistantLines: 2, assistantWithoutUsage: 0, unknownTypes: {} });
    expect(count("calls")).toBe(1);
    expect(db.prepare("SELECT kind FROM events ORDER BY ts").all()).toEqual([{ kind: "user_prompt" }, { kind: "wake_idle" }]);
    expect(count("pr_links")).toBe(1);
  });

  it("parses the golden deferred_tools_delta fixture, one startup_ctx row per server", () => {
    const fixture = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures", "deferred-tools-delta.jsonl");
    const dir = path.join(tmpDir(), "proj");
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, "f0000000-0000-0000-0000-000000000002.jsonl");
    fs.copyFileSync(fixture, target);
    ingestFile(db, { ...file, path: target, sessionId: "s1" }, newHealth());
    expect(db.prepare("SELECT category, source, chars FROM startup_ctx ORDER BY source").all()).toEqual([
      { category: "deferred_tools", source: "acme", chars: 20 },
      { category: "deferred_tools", source: "builtin", chars: 5 },
      { category: "deferred_tools", source: "prism-mcp", chars: 10 },
    ]);
  });
});
