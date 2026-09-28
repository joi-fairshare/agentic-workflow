import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { openDb } from "../src/db.js";
import { verdict } from "../src/format-health.js";
import { ingestAll } from "../src/ingest.js";
import { codexSource, createCodexParser, discoverCodexFiles, importedThreadIds } from "../src/transcript/codex.js";
import { ingestFile } from "../src/ingest.js";
import { newHealth } from "../src/format-health.js";
import type { TranscriptFile } from "../src/transcript/source.js";
import { appendRaw, tmpDir } from "./helpers.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "codex", "sessions");
const MAIN = "0a1b2c3d-0000-4000-8000-000000000001";
const SUB = "0a1b2c3d-0000-4000-8000-000000000002";
const TS = "2026-09-26T10:00:00.000Z";

const mainFile: TranscriptFile = { provider: "codex", path: "/x/rollout-a.jsonl", project: "p", sessionId: MAIN, agentId: "main", agentType: "main", isMain: true, agentPath: "/root" };
const line = (type: string, payload: unknown) => JSON.stringify({ timestamp: TS, type, payload });
const userMsg = (...texts: string[]) => line("response_item", { type: "message", role: "user", content: texts.map((text) => ({ type: "input_text", text })) });

describe("discoverCodexFiles", () => {
  it("finds main and subagent rollouts from their session_meta", () => {
    const files = discoverCodexFiles(FIXTURES).sort((a, b) => a.path.localeCompare(b.path));
    expect(files.map(({ path: p, ...rest }) => ({ name: path.basename(p), ...rest }))).toEqual([
      { name: `rollout-2026-09-26T10-00-00-${MAIN}.jsonl`, provider: "codex", project: "-Users-dev-acme-web", sessionId: MAIN, agentId: "main", agentType: "main", isMain: true, agentPath: "/root" },
      { name: `rollout-2026-09-26T10-00-08-${SUB}.jsonl`, provider: "codex", project: "-Users-dev-acme-web", sessionId: MAIN, agentId: SUB, agentType: "explorer", isMain: false, agentPath: "/root/explorer_one" },
    ]);
  });

  it("degrades gracefully on odd first lines and subagent shapes", () => {
    const root = tmpDir();
    const day = path.join(root, "2026", "09", "26");
    fs.mkdirSync(day, { recursive: true });
    const meta = (id: string, extra: Record<string, unknown>) => `${JSON.stringify({ timestamp: TS, type: "session_meta", payload: { id, ...extra } })}\n`;
    fs.writeFileSync(path.join(day, "rollout-1-aaaaaaaa-0000-4000-8000-000000000001.jsonl"), "{broken\n");
    fs.writeFileSync(path.join(day, "rollout-2-aaaaaaaa-0000-4000-8000-000000000002.jsonl"), `${JSON.stringify({ type: "response_item" })}\n`);
    fs.writeFileSync(path.join(day, "rollout-3.jsonl"), meta("g1", { source: { subagent: { other: "guardian" } } }));
    fs.writeFileSync(path.join(day, "rollout-4.jsonl"), meta("d1", { source: { subagent: { thread_spawn: { parent_thread_id: "parent" } } } }));
    fs.writeFileSync(path.join(day, "rollout-5.jsonl"), meta("u1", { source: { subagent: {} } }));
    fs.writeFileSync(path.join(day, "rollout-6.jsonl"), meta("r1", { source: { subagent: { thread_spawn: { agent_role: null } } } }));
    fs.writeFileSync(path.join(day, "notes.jsonl"), "");
    const byName = new Map(discoverCodexFiles(root).map((f) => [path.basename(f.path), f]));
    expect(byName.size).toBe(6);
    expect(byName.get("rollout-1-aaaaaaaa-0000-4000-8000-000000000001.jsonl")).toMatchObject({ project: "unknown", sessionId: "aaaaaaaa-0000-4000-8000-000000000001", isMain: true });
    expect(byName.get("rollout-2-aaaaaaaa-0000-4000-8000-000000000002.jsonl")).toMatchObject({ sessionId: "aaaaaaaa-0000-4000-8000-000000000002", isMain: true });
    expect(byName.get("rollout-3.jsonl")).toMatchObject({ sessionId: "g1", agentId: "g1", agentType: "guardian", isMain: false });
    expect(byName.get("rollout-3.jsonl")?.agentPath).toBeUndefined();
    expect(byName.get("rollout-4.jsonl")).toMatchObject({ sessionId: "parent", agentType: "default", isMain: false });
    expect(byName.get("rollout-5.jsonl")).toMatchObject({ agentType: "unknown", isMain: false });
    expect(byName.get("rollout-6.jsonl")).toMatchObject({ sessionId: "r1", agentType: "default" });
  });

  it("returns nothing for a missing directory", () => {
    expect(discoverCodexFiles(path.join(tmpDir(), "nope"))).toEqual([]);
    expect(codexSource.provider).toBe("codex");
  });
});

describe("codex ingestion (sanitized fixture)", () => {
  it("normalizes calls, human turns, interrupts, and agent messages", () => {
    const db = openDb(":memory:");
    ingestAll(db, discoverCodexFiles(FIXTURES));
    const calls = db.prepare("SELECT agent_type, is_main, model, input, cache_read, cache_creation, output, provider FROM calls ORDER BY ts, agent_type").all();
    expect(calls).toEqual([
      { agent_type: "main", is_main: 1, model: "gpt-5.5-codex", input: 200, cache_read: 800, cache_creation: 0, output: 50, provider: "codex" },
      { agent_type: "explorer", is_main: 0, model: "gpt-5.5-codex-mini", input: 900, cache_read: 0, cache_creation: 0, output: 40, provider: "codex" },
      { agent_type: "main", is_main: 1, model: "gpt-5.5-codex", input: 200, cache_read: 1200, cache_creation: 100, output: 50, provider: "codex" },
    ]);
    const events = db.prepare("SELECT kind, session_id, detail, provider FROM events ORDER BY ts, kind, detail").all();
    expect(events).toEqual([
      { kind: "user_prompt", session_id: MAIN, detail: null, provider: "codex" },
      { kind: "user_correction", session_id: MAIN, detail: null, provider: "codex" },
      { kind: "interrupt", session_id: MAIN, detail: null, provider: "codex" },
      { kind: "wake_text", session_id: MAIN, detail: "/root", provider: "codex" },
      { kind: "wake_text", session_id: MAIN, detail: "/root/explorer_one", provider: "codex" },
      { kind: "user_continue", session_id: MAIN, detail: null, provider: "codex" },
    ]);
  });

  it("reports a clean format verdict for the fixture", () => {
    const db = openDb(":memory:");
    const h = ingestAll(db, discoverCodexFiles(FIXTURES));
    expect(h.byProvider.codex).toEqual({ files: 2, lines: h.lines });
    expect(h.assistantLines).toBe(5);
    expect(verdict(h)).toEqual({ status: "ok", problems: [], notices: [] });
  });
});

describe("createCodexParser", () => {
  it("flags non-JSON and untyped lines", () => {
    const p = createCodexParser(mainFile);
    expect(p.parse("{nope", 0)).toEqual({ lineType: null, jsonError: true, assistantWithoutUsage: false, records: [] });
    expect(p.parse(JSON.stringify({ type: "x" }), 0)).toEqual({ lineType: null, jsonError: false, assistantWithoutUsage: false, records: [] });
  });

  it("flags a token_count whose shape drifted", () => {
    const out = createCodexParser(mainFile).parse(line("event_msg", { type: "token_count", info: { total_token_usage: {} } }), 0);
    expect(out).toMatchObject({ lineType: "codex:token_count", assistantWithoutUsage: true, records: [] });
  });

  it("defaults the model to unknown and missing usage fields to zero", () => {
    const usage = { input_tokens: 10, total_tokens: 10 };
    const out = createCodexParser(mainFile).parse(line("event_msg", { type: "token_count", info: { total_token_usage: usage, last_token_usage: usage } }), 0);
    expect(out.records).toEqual([{ t: "call", messageId: "tc:10", sessionId: MAIN, ts: TS, model: "unknown", input: 10, cacheRead: 0, cacheCreation: 0, output: 0 }]);
  });

  it("ignores turn_context without a model, non-interrupt aborts, and other lines", () => {
    const p = createCodexParser(mainFile);
    expect(p.parse(line("turn_context", { cwd: "/x" }), 0).records).toEqual([]);
    expect(p.parse(line("event_msg", { type: "turn_aborted", reason: "replaced" }), 0).records).toEqual([]);
    expect(p.parse(line("event_msg", { type: "turn_aborted" }), 0).records).toEqual([]);
    expect(p.parse(line("event_msg", "not-an-object"), 0)).toMatchObject({ lineType: "codex:event_msg", records: [] });
    expect(p.parse(line("brand_new", {}), 0).lineType).toBe("codex:brand_new");
  });

  it("uses the byte offset as the event id", () => {
    const out = createCodexParser(mainFile).parse(userMsg("ship it"), 1234);
    expect(out.records).toEqual([{ t: "event", uuid: "off:1234", sessionId: MAIN, ts: TS, kind: "user_prompt", detail: null }]);
  });

  it("skips subagent user turns, non-text parts, machine-only text, and messages to other agents", () => {
    const sub = createCodexParser({ ...mainFile, isMain: false, agentPath: "/root/x" });
    expect(sub.parse(userMsg("do the thing"), 0).records).toEqual([]);
    const p = createCodexParser(mainFile);
    expect(p.parse(line("response_item", { type: "message", role: "user", content: [{ type: "input_image" }] }), 0).records).toEqual([]);
    expect(p.parse(userMsg("<timestamp>now</timestamp>", "Caveat: generated"), 0).records).toEqual([]);
    expect(p.parse(userMsg("Caveat: the messages below were generated"), 0).records).toEqual([]);
    expect(p.parse(line("response_item", { type: "agent_message", author: "/root/a", recipient: "/root/b" }), 0).records).toEqual([]);
    const noPath = createCodexParser({ ...mainFile, agentPath: undefined });
    expect(noPath.parse(line("response_item", { type: "agent_message", author: "/root/a", recipient: "/root" }), 0).records).toEqual([]);
  });
});

describe("Claude sessions imported into Codex", () => {
  const usage = (total: number) => ({ input_tokens: 100, cached_input_tokens: 0, output_tokens: 1, total_tokens: total });
  const tc = (total: number) => line("event_msg", { type: "token_count", info: { total_token_usage: usage(total), last_token_usage: usage(total) } });

  function importedRollout(extraLedger?: string): { root: string; file: string } {
    const home = tmpDir();
    const root = path.join(home, "sessions");
    const day = path.join(root, "2026", "09", "26");
    fs.mkdirSync(day, { recursive: true });
    const file = path.join(day, `rollout-x-${MAIN}.jsonl`);
    fs.writeFileSync(file, [
      line("session_meta", { id: MAIN, session_id: MAIN, cwd: "/w", source: "vscode" }),
      userMsg("copied from a Claude transcript"),
      tc(500),
      "",
    ].join("\n"));
    fs.writeFileSync(path.join(home, "external_agent_session_imports.json"), extraLedger ?? JSON.stringify({ records: [{ imported_thread_id: MAIN, source_path: "/c.jsonl" }] }));
    return { root, file };
  }

  it("reads the import ledger, tolerating a missing or malformed one", () => {
    const { root } = importedRollout();
    expect([...importedThreadIds(root)]).toEqual([MAIN]);
    expect(importedThreadIds(path.join(tmpDir(), "sessions")).size).toBe(0);
    expect(importedThreadIds(importedRollout("{\"records\": 5}").root).size).toBe(0);
  });

  it("skips the copied history and counts only turns run in Codex, even across incremental reads", () => {
    const { root, file } = importedRollout();
    const [rollout] = discoverCodexFiles(root);
    expect(rollout).toMatchObject({ imported: true, isMain: true });
    const db = openDb(":memory:");
    ingestFile(db, rollout!, newHealth());
    expect(db.prepare("SELECT COUNT(*) AS n FROM calls").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM events").get()).toEqual({ n: 0 });

    appendRaw(file, `${[line("turn_context", { model: "gpt-5.5-codex" }), userMsg("now continue in codex"), tc(700)].join("\n")}\n`);
    ingestFile(db, rollout!, newHealth());
    // A later read resumes mid-file; the replayed prefix restores the model.
    appendRaw(file, `${tc(900)}\n`);
    ingestFile(db, rollout!, newHealth());
    expect(db.prepare("SELECT message_id, model FROM calls ORDER BY message_id").all()).toEqual([
      { message_id: "tc:700", model: "gpt-5.5-codex" },
      { message_id: "tc:900", model: "gpt-5.5-codex" },
    ]);
    expect(db.prepare("SELECT kind FROM events").all()).toEqual([{ kind: "user_prompt" }]);
  });

  it("marks an imported subagent thread by its own id", () => {
    const { root } = importedRollout(JSON.stringify({ records: [{ imported_thread_id: SUB }] }));
    const day = path.join(root, "2026", "09", "26");
    fs.writeFileSync(path.join(day, `rollout-y-${SUB}.jsonl`), `${line("session_meta", { id: SUB, session_id: MAIN, source: { subagent: { other: "guardian" } } })}\n`);
    const byId = new Map(discoverCodexFiles(root).map((f) => [f.agentId, f.imported]));
    expect(byId).toEqual(new Map([["main", undefined], [SUB, true]]));
  });
});
