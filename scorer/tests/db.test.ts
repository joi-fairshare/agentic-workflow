import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { openDb } from "../src/db.js";

describe("openDb", () => {
  it("creates every table", () => {
    const db = openDb(":memory:");
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);
    expect(tables).toEqual(["calls", "events", "files", "pr_links", "pr_state", "startup_ctx"]);
  });

  it("creates the startup_ctx table with a category and source column", () => {
    const db = openDb(":memory:");
    expect(() => db.prepare("SELECT file, uuid, session_id, ts, category, source, chars FROM startup_ctx").all()).not.toThrow();
  });

  it("is idempotent", () => {
    const db = openDb(":memory:");
    expect(() => db.exec("SELECT 1")).not.toThrow();
  });

  it("adds the provider column to a scorer.sqlite written before multi-provider support", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "scorer-db-")), "old.sqlite");
    const old = new Database(file);
    old.exec("CREATE TABLE calls (file TEXT NOT NULL, message_id TEXT NOT NULL, project TEXT NOT NULL, session_id TEXT NOT NULL, agent_id TEXT NOT NULL, agent_type TEXT NOT NULL, is_main INTEGER NOT NULL, model TEXT NOT NULL, ts TEXT NOT NULL, input INTEGER NOT NULL, cache_read INTEGER NOT NULL, cache_creation INTEGER NOT NULL, output INTEGER NOT NULL, PRIMARY KEY (file, message_id))");
    old.exec("INSERT INTO calls VALUES ('f', 'm', 'p', 's', 'a', 'main', 1, 'x', 't', 1, 0, 0, 0)");
    old.close();
    const db = openDb(file);
    expect(db.prepare("SELECT provider FROM calls").get()).toEqual({ provider: "claude" });
    db.close();
    const again = openDb(file); // idempotent: the column is not added twice
    expect(again.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('calls') WHERE name = 'provider'").get()).toEqual({ n: 1 });
    again.close();
  });

  it("sets busy_timeout", () => {
    const db = openDb(":memory:");
    expect(db.pragma("busy_timeout", { simple: true })).toBe(2000);
  });
});
