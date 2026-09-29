import fs from "node:fs";

import type { Db } from "./db.js";
import type { FormatHealth } from "./format-health.js";
import type { LineOutcome } from "./transcript/parse-line.js";
import type { TranscriptFile } from "./transcript/source.js";
import { newHealth, recordFile, recordHealth } from "./format-health.js";
import { SOURCES } from "./transcript/sources.js";

const NEWLINE = 0x0a;

export function ingestAll(db: Db, files: TranscriptFile[]): FormatHealth {
  const health = newHealth();
  for (const file of files) {
    recordFile(health, file.provider);
    try {
      ingestFile(db, file, health);
    } catch (e) {
      health.readErrors.push(`${file.path}: ${(e as Error).message}`);
    }
  }
  return health;
}

export function ingestFile(db: Db, file: TranscriptFile, health: FormatHealth): void {
  const size = fs.statSync(file.path).size;
  const row = db.prepare("SELECT offset FROM files WHERE path = ?").get(file.path) as { offset: number } | undefined;
  let offset = row?.offset ?? 0;
  if (size < offset) {
    purge(db, file.path);
    offset = 0;
  }
  if (size === offset) return;
  const source = SOURCES[file.provider];
  // A stateful parser replays the already-ingested prefix (records discarded)
  // so it resumes with the context it had; offset always sits just past a newline.
  const start = source.stateful ? 0 : offset;
  const buf = Buffer.alloc(size - start);
  const fd = fs.openSync(file.path, "r");
  try {
    fs.readSync(fd, buf, 0, buf.length, start);
  } finally {
    fs.closeSync(fd);
  }
  const parser = source.createParser(file);
  const prefix = offset - start;
  if (prefix > 0) forEachLine(buf, prefix - 1, (line, at) => parser.parse(line, at));
  const rest = buf.subarray(prefix);
  const end = rest.lastIndexOf(NEWLINE);
  if (end === -1) return;
  const s = statements(db);
  db.transaction(() => {
    forEachLine(rest, end, (line, at) => apply(s, file, parser.parse(line, offset + at), health));
    s.saveOffset.run(file.path, offset + end + 1, size, file.provider);
  })();
}

// Calls fn(line, byteOffsetInBuf) for every non-blank line in buf[0..end].
function forEachLine(buf: Buffer, end: number, fn: (line: string, at: number) => void): void {
  let start = 0;
  while (start <= end) {
    const nl = buf.indexOf(NEWLINE, start);
    const line = buf.toString("utf8", start, nl);
    if (line.trim() !== "") fn(line, start);
    start = nl + 1;
  }
}

function purge(db: Db, path: string): void {
  for (const table of ["calls", "events", "pr_links", "startup_ctx", "files"]) {
    db.prepare(`DELETE FROM ${table} WHERE ${table === "files" ? "path" : "file"} = ?`).run(path);
  }
}

function statements(db: Db) {
  return {
    upsertCall: db.prepare(`
      INSERT INTO calls (file, message_id, project, session_id, agent_id, agent_type, is_main, model, ts, input, cache_read, cache_creation, output, provider)
      VALUES (@file, @messageId, @project, @sessionId, @agentId, @agentType, @isMain, @model, @ts, @input, @cacheRead, @cacheCreation, @output, @provider)
      ON CONFLICT (file, message_id) DO UPDATE SET output = max(calls.output, excluded.output)`),
    insertEvent: db.prepare("INSERT OR IGNORE INTO events (file, uuid, kind, session_id, ts, detail, provider) VALUES (?, ?, ?, ?, ?, ?, ?)"),
    insertPr: db.prepare("INSERT OR IGNORE INTO pr_links (file, session_id, repo, number, ts, provider) VALUES (?, ?, ?, ?, ?, ?)"),
    insertStartupCtx: db.prepare("INSERT OR IGNORE INTO startup_ctx (file, uuid, session_id, ts, category, source, chars, provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"),
    saveOffset: db.prepare("INSERT INTO files (path, offset, size, provider) VALUES (?, ?, ?, ?) ON CONFLICT (path) DO UPDATE SET offset = excluded.offset, size = excluded.size, provider = excluded.provider"),
  };
}

function apply(s: ReturnType<typeof statements>, file: TranscriptFile, o: LineOutcome, health: FormatHealth): void {
  recordHealth(health, o, file.agentType, file.provider);
  for (const r of o.records) {
    switch (r.t) {
      case "call":
        s.upsertCall.run({ file: file.path, project: file.project, agentId: file.agentId, agentType: file.agentType, isMain: file.isMain ? 1 : 0, provider: file.provider, messageId: r.messageId, sessionId: r.sessionId, model: r.model, ts: r.ts, input: r.input, cacheRead: r.cacheRead, cacheCreation: r.cacheCreation, output: r.output });
        break;
      case "event":
        s.insertEvent.run(file.path, r.uuid, r.kind, r.sessionId, r.ts, r.detail, file.provider);
        break;
      case "pr":
        s.insertPr.run(file.path, r.sessionId, r.repo, r.number, r.ts, file.provider);
        break;
      case "startup_ctx":
        s.insertStartupCtx.run(file.path, r.uuid, r.sessionId, r.ts, r.category, r.source, r.chars, file.provider);
        break;
    }
  }
}
