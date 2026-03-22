import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { createDbClient, type DbClient } from "../src/db/client.js";
import { MIGRATIONS } from "../src/db/schema.js";
import { createConversationController } from "../src/transport/controllers/conversation-controller.js";
import { randomUUID } from "node:crypto";

let db: DbClient;
let controller: ReturnType<typeof createConversationController>;

beforeEach(() => {
  const raw = new Database(":memory:");
  raw.pragma("journal_mode = WAL");
  raw.exec(MIGRATIONS);
  db = createDbClient(raw);
  controller = createConversationController(db);
});

describe("list", () => {
  it("returns conversations with default pagination", async () => {
    const conv = randomUUID();
    db.insertMessage({ conversation: conv, sender: "a", recipient: "b", kind: "context", payload: "msg", meta_prompt: null });

    const result = await controller.list({
      query: { limit: 20, offset: 0 },
      body: undefined as never,
      params: undefined as never,
      requestId: "test",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversations).toHaveLength(1);
    expect(result.data.total).toBe(1);
  });

  it("returns empty result for empty database", async () => {
    const result = await controller.list({
      query: { limit: 20, offset: 0 },
      body: undefined as never,
      params: undefined as never,
      requestId: "test",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversations).toHaveLength(0);
    expect(result.data.total).toBe(0);
  });

  it("paginates correctly", async () => {
    for (let i = 0; i < 3; i++) {
      db.insertMessage({ conversation: randomUUID(), sender: "a", recipient: "b", kind: "context", payload: `m${i}`, meta_prompt: null });
    }

    const result = await controller.list({
      query: { limit: 2, offset: 0 },
      body: undefined as never,
      params: undefined as never,
      requestId: "test",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversations).toHaveLength(2);
    expect(result.data.total).toBe(3);
  });
});
