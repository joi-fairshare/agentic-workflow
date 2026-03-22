import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type DbClient } from "../../src/db/client.js";
import { createConversationRoutes } from "../../src/routes/conversations.js";
import { createServer } from "../../src/server.js";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createTestBridgeDb } from "../helpers.js";

let app: FastifyInstance;
let db: DbClient;

beforeEach(async () => {
  ({ db } = createTestBridgeDb());
  const conversationRoutes = createConversationRoutes(db);
  app = createServer([conversationRoutes]);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("GET /conversations", () => {
  it("returns 200 with conversation list", async () => {
    db.insertMessage({ conversation: randomUUID(), sender: "a", recipient: "b", kind: "context", payload: "msg", meta_prompt: null });

    const res = await app.inject({
      method: "GET",
      url: "/conversations",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.conversations).toHaveLength(1);
    expect(body.data.total).toBe(1);
  });

  it("returns empty result for empty database", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/conversations",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.conversations).toHaveLength(0);
  });

  it("respects limit and offset query params", async () => {
    for (let i = 0; i < 3; i++) {
      db.insertMessage({ conversation: randomUUID(), sender: "a", recipient: "b", kind: "context", payload: `m${i}`, meta_prompt: null });
    }

    const res = await app.inject({
      method: "GET",
      url: "/conversations?limit=2&offset=0",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.conversations).toHaveLength(2);
    expect(body.data.total).toBe(3);
  });
});

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
