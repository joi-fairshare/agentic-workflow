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

  it("sets busy_timeout", () => {
    const db = openDb(":memory:");
    expect(db.pragma("busy_timeout", { simple: true })).toBe(2000);
  });
});
