import { describe, it, expect, beforeEach } from "vitest";
import { type DbClient } from "../src/db/client.js";
import { sendContext } from "../src/application/services/send-context.js";
import { getMessagesByConversation, getUnreadMessages } from "../src/application/services/get-messages.js";
import { assignTask } from "../src/application/services/assign-task.js";
import { reportStatus } from "../src/application/services/report-status.js";
import { randomUUID } from "node:crypto";
import { createTestBridgeDb } from "./helpers.js";

// NOTE: resultToContent below mirrors the private helper in mcp.ts.
// Both implementations must remain in sync. If you change the formatting
// logic in mcp.ts, update this copy (and vice versa).
function resultToContent<T>(result: { ok: true; data: T } | { ok: false; error: { code: string; message: string } }) {
  if (result.ok) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
    };
  }
  return {
    content: [{ type: "text" as const, text: `Error [${result.error.code}]: ${result.error.message}` }],
    isError: true,
  };
}

let db: DbClient;

beforeEach(() => {
  ({ db } = createTestBridgeDb());
});

describe("resultToContent", () => {
  it("formats success result as JSON text", () => {
    const result = resultToContent({ ok: true as const, data: { id: "123" } });
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text)).toEqual({ id: "123" });
    expect(result).not.toHaveProperty("isError");
  });

  it("formats error result with code and message", () => {
    const result = resultToContent({ ok: false as const, error: { code: "NOT_FOUND", message: "Gone" } });
    expect(result.content[0].text).toBe("Error [NOT_FOUND]: Gone");
    expect(result.isError).toBe(true);
  });
});

describe("send_context tool", () => {
  it("creates a message via sendContext service", () => {
    const conv = randomUUID();
    const result = sendContext(db, { conversation: conv, sender: "claude", recipient: "codex", payload: "hello" });
    const content = resultToContent(result);
    expect(content).not.toHaveProperty("isError");
    const data = JSON.parse(content.content[0].text);
    expect(data.conversation).toBe(conv);
  });
});

describe("get_messages tool", () => {
  it("retrieves messages for a conversation", () => {
    const conv = randomUUID();
    sendContext(db, { conversation: conv, sender: "a", recipient: "b", payload: "msg" });
    const result = getMessagesByConversation(db, conv);
    const content = resultToContent(result);
    const data = JSON.parse(content.content[0].text);
    expect(data).toHaveLength(1);
  });
});

describe("get_unread tool", () => {
  it("returns unread and marks them read", () => {
    sendContext(db, { conversation: randomUUID(), sender: "a", recipient: "bob", payload: "msg" });
    const result = getUnreadMessages(db, "bob");
    const content = resultToContent(result);
    const data = JSON.parse(content.content[0].text);
    expect(data).toHaveLength(1);

    const result2 = getUnreadMessages(db, "bob");
    const data2 = JSON.parse(resultToContent(result2).content[0].text);
    expect(data2).toHaveLength(0);
  });
});

describe("assign_task tool", () => {
  it("creates a task", () => {
    const conv = randomUUID();
    const result = assignTask(db, { conversation: conv, domain: "backend", summary: "Fix", details: "Details" });
    const content = resultToContent(result);
    const data = JSON.parse(content.content[0].text);
    expect(data.status).toBe("pending");
  });
});

describe("report_status tool", () => {
  it("updates task status", () => {
    const conv = randomUUID();
    const taskResult = assignTask(db, { conversation: conv, domain: "x", summary: "s", details: "d" });
    if (!taskResult.ok) return;
    const result = reportStatus(db, {
      conversation: conv, sender: "codex", recipient: "claude",
      task_id: taskResult.data.id, status: "completed", payload: "Done",
    });
    const content = resultToContent(result);
    const data = JSON.parse(content.content[0].text);
    expect(data.task_updated).toBe(true);
  });
});
