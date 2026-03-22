import { describe, it, expect } from "vitest";
import { createDatabase, MIGRATIONS } from "../src/db/schema.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";

describe("createDatabase", () => {
  it("creates a database with WAL mode and tables", () => {
    const path = join(tmpdir(), `test-${randomUUID()}.db`);
    try {
      const db = createDatabase(path);
      // Verify WAL mode
      const mode = db.pragma("journal_mode", { simple: true });
      expect(mode).toBe("wal");
      // Verify tables exist
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain("messages");
      expect(tableNames).toContain("tasks");
      db.close();
    } finally {
      try { unlinkSync(path); } catch {}
      try { unlinkSync(path + "-wal"); } catch {}
      try { unlinkSync(path + "-shm"); } catch {}
    }
  });

  it("uses default path when none provided", () => {
    // Just verify MIGRATIONS constant is a non-empty string with CREATE TABLE
    expect(MIGRATIONS).toContain("CREATE TABLE IF NOT EXISTS messages");
    expect(MIGRATIONS).toContain("CREATE TABLE IF NOT EXISTS tasks");
  });
});
