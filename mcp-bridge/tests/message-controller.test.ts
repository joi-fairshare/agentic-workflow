import { describe, it, expect, beforeEach, vi } from "vitest";
import { type DbClient } from "../src/db/client.js";
import { createMessageController } from "../src/transport/controllers/message-controller.js";
import * as sendContextService from "../src/application/services/send-context.js";
import * as getMessagesService from "../src/application/services/get-messages.js";
import { err } from "../src/application/result.js";
import { randomUUID } from "node:crypto";
import { createTestBridgeDb } from "./helpers.js";

let db: DbClient;
let controller: ReturnType<typeof createMessageController>;

beforeEach(() => {
  ({ db } = createTestBridgeDb());
  controller = createMessageController(db);
});

describe("send error path", () => {
  it("returns error when sendContext service fails", async () => {
    vi.spyOn(sendContextService, "sendContext").mockReturnValueOnce(
      err({ code: "INTERNAL_ERROR", message: "DB failure", statusHint: 500 }),
    );
    const result = await controller.send({
      body: { conversation: randomUUID(), sender: "claude", recipient: "codex", payload: "hello" },
      params: undefined as never,
      query: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INTERNAL_ERROR");
    vi.restoreAllMocks();
  });
});

describe("getByConversation error path", () => {
  it("returns error when getMessagesByConversation service fails", async () => {
    vi.spyOn(getMessagesService, "getMessagesByConversation").mockReturnValueOnce(
      err({ code: "INTERNAL_ERROR", message: "DB failure", statusHint: 500 }),
    );
    const result = await controller.getByConversation({
      params: { conversation: randomUUID() },
      body: undefined as never,
      query: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INTERNAL_ERROR");
    vi.restoreAllMocks();
  });
});

describe("getUnread error path", () => {
  it("returns error when getUnreadMessages service fails", async () => {
    vi.spyOn(getMessagesService, "getUnreadMessages").mockReturnValueOnce(
      err({ code: "INTERNAL_ERROR", message: "DB failure", statusHint: 500 }),
    );
    const result = await controller.getUnread({
      query: { recipient: "bob" },
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

describe("send", () => {
  it("creates a message and returns it", async () => {
    const conv = randomUUID();
    const result = await controller.send({
      body: { conversation: conv, sender: "claude", recipient: "codex", payload: "hello", meta_prompt: "analyze" },
      params: undefined as never,
      query: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversation).toBe(conv);
    expect(result.data.sender).toBe("claude");
    expect(result.data.kind).toBe("context");
  });
});

describe("getByConversation", () => {
  it("returns messages for a conversation", async () => {
    const conv = randomUUID();
    db.insertMessage({ conversation: conv, sender: "a", recipient: "b", kind: "context", payload: "msg", meta_prompt: null });
    const result = await controller.getByConversation({
      params: { conversation: conv },
      body: undefined as never,
      query: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
  });

  it("returns empty array for unknown conversation", async () => {
    const result = await controller.getByConversation({
      params: { conversation: randomUUID() },
      body: undefined as never,
      query: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(0);
  });
});

describe("getUnread", () => {
  it("returns unread messages and marks them read", async () => {
    const conv = randomUUID();
    db.insertMessage({ conversation: conv, sender: "a", recipient: "bob", kind: "context", payload: "msg", meta_prompt: null });
    const first = await controller.getUnread({
      query: { recipient: "bob" },
      body: undefined as never,
      params: undefined as never,
      requestId: "test",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data).toHaveLength(1);

    const second = await controller.getUnread({
      query: { recipient: "bob" },
      body: undefined as never,
      params: undefined as never,
      requestId: "test",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data).toHaveLength(0);
  });
});
