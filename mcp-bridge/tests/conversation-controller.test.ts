import { describe, it, expect, beforeEach, vi } from "vitest";
import { type DbClient } from "../src/db/client.js";
import { createConversationController } from "../src/transport/controllers/conversation-controller.js";
import * as getConversationsService from "../src/application/services/get-conversations.js";
import { err } from "../src/application/result.js";
import { randomUUID } from "node:crypto";
import { createTestBridgeDb } from "./helpers.js";

let db: DbClient;
let controller: ReturnType<typeof createConversationController>;

beforeEach(() => {
  ({ db } = createTestBridgeDb());
  controller = createConversationController(db);
});

describe("list error path", () => {
  it("returns error when getConversations service fails", async () => {
    vi.spyOn(getConversationsService, "getConversations").mockReturnValueOnce(
      err({ code: "INTERNAL_ERROR", message: "DB failure", statusHint: 500 }),
    );

    const result = await controller.list({
      query: { limit: 20, offset: 0 },
      body: undefined as never,
      params: undefined as never,
      requestId: "test",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INTERNAL_ERROR");

    vi.restoreAllMocks();
  });
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
