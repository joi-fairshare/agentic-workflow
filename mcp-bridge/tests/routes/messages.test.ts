import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createDbClient, type DbClient } from "../../src/db/client.js";
import { MIGRATIONS } from "../../src/db/schema.js";
import { createEventBus } from "../../src/application/events.js";
import { createMessageRoutes } from "../../src/routes/messages.js";
import { createServer } from "../../src/server.js";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

let app: FastifyInstance;
let db: DbClient;

beforeEach(async () => {
  const raw = new Database(":memory:");
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  raw.exec(MIGRATIONS);
  db = createDbClient(raw);
  const eventBus = createEventBus();
  const messageRoutes = createMessageRoutes(db, eventBus);
  app = createServer([messageRoutes]);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("POST /messages/send", () => {
  it("returns 201 with created message", async () => {
    const conv = randomUUID();
    const res = await app.inject({
      method: "POST",
      url: "/messages/send",
      payload: { conversation: conv, sender: "claude", recipient: "codex", payload: "hello" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.conversation).toBe(conv);
    expect(body.data.kind).toBe("context");
  });

  it("returns 400 for missing required fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/messages/send",
      payload: { conversation: randomUUID() },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid conversation UUID", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/messages/send",
      payload: { conversation: "not-a-uuid", sender: "a", recipient: "b", payload: "msg" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /messages/conversation/:conversation", () => {
  it("returns 200 with messages array", async () => {
    const conv = randomUUID();
    db.insertMessage({ conversation: conv, sender: "a", recipient: "b", kind: "context", payload: "test", meta_prompt: null });

    const res = await app.inject({
      method: "GET",
      url: `/messages/conversation/${conv}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it("returns empty array for unknown conversation", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/messages/conversation/${randomUUID()}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
  });
});

describe("GET /messages/unread", () => {
  it("returns 200 with unread messages", async () => {
    db.insertMessage({ conversation: randomUUID(), sender: "a", recipient: "bob", kind: "context", payload: "msg", meta_prompt: null });

    const res = await app.inject({
      method: "GET",
      url: "/messages/unread?recipient=bob",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });

  it("returns 400 when recipient is missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/messages/unread",
    });

    expect(res.statusCode).toBe(400);
  });
});
