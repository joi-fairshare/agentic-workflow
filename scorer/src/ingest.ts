import fs from "node:fs";

import type { Db } from "./db.js";
import type { FormatHealth } from "./format-health.js";
import type { TranscriptFile } from "./transcript/discover.js";
import type { LineOutcome } from "./transcript/parse-line.js";
import { newHealth, recordHealth } from "./format-health.js";
import { parseLine } from "./transcript/parse-line.js";

const NEWLINE = 0x0a;

export function ingestAll(db: Db, files: TranscriptFile[]): FormatHealth {
  const health = newHealth();
  for (const file of files) {
    health.files++;
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
  const buf = Buffer.alloc(size - offset);
  const fd = fs.openSync(file.path, "r");
  try {
    fs.readSync(fd, buf, 0, buf.length, offset);
  } finally {
    fs.closeSync(fd);
  }
  const end = buf.lastIndexOf(NEWLINE);
  if (end === -1) return;
  const lines = buf.subarray(0, end + 1).toString("utf8").split("\n").filter((l) => l.trim() !== "");
  const s = statements(db);
  db.transaction(() => {
    for (const line of lines) apply(s, file, parseLine(line), health);
    s.saveOffset.run(file.path, offset + end + 1, size);
  })();
}

function purge(db: Db, path: string): void {
  for (const table of ["calls", "events", "pr_links", "startup_ctx", "files"]) {
    db.prepare(`DELETE FROM ${table} WHERE ${table === "files" ? "path" : "file"} = ?`).run(path);
  }
}

function statements(db: Db) {
  return {
    upsertCall: db.prepare(`
      INSERT INTO calls (file, message_id, project, session_id, agent_id, agent_type, is_main, model, ts, input, cache_read, cache_creation, output)
      VALUES (@file, @messageId, @project, @sessionId, @agentId, @agentType, @isMain, @model, @ts, @input, @cacheRead, @cacheCreation, @output)
      ON CONFLICT (file, message_id) DO UPDATE SET output = max(calls.output, excluded.output)`),
    insertEvent: db.prepare("INSERT OR IGNORE INTO events (file, uuid, kind, session_id, ts, detail) VALUES (?, ?, ?, ?, ?, ?)"),
    insertPr: db.prepare("INSERT OR IGNORE INTO pr_links (file, session_id, repo, number, ts) VALUES (?, ?, ?, ?, ?)"),
    insertStartupCtx: db.prepare("INSERT OR IGNORE INTO startup_ctx (file, uuid, session_id, ts, category, source, chars) VALUES (?, ?, ?, ?, ?, ?, ?)"),
    saveOffset: db.prepare("INSERT INTO files (path, offset, size) VALUES (?, ?, ?) ON CONFLICT (path) DO UPDATE SET offset = excluded.offset, size = excluded.size"),
  };
}

function apply(s: ReturnType<typeof statements>, file: TranscriptFile, o: LineOutcome, health: FormatHealth): void {
  recordHealth(health, o, file.agentType);
  for (const r of o.records) {
    switch (r.t) {
      case "call":
        s.upsertCall.run({ file: file.path, project: file.project, agentId: file.agentId, agentType: file.agentType, isMain: file.isMain ? 1 : 0, messageId: r.messageId, sessionId: r.sessionId, model: r.model, ts: r.ts, input: r.input, cacheRead: r.cacheRead, cacheCreation: r.cacheCreation, output: r.output });
        break;
      case "event":
        s.insertEvent.run(file.path, r.uuid, r.kind, r.sessionId, r.ts, r.detail);
        break;
      case "pr":
        s.insertPr.run(file.path, r.sessionId, r.repo, r.number, r.ts);
        break;
      case "startup_ctx":
        s.insertStartupCtx.run(file.path, r.uuid, r.sessionId, r.ts, r.category, r.source, r.chars);
        break;
    }
  }
}
