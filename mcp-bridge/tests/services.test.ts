import { describe, it, expect, beforeEach } from "vitest";
import { type DbClient } from "../src/db/client.js";
import { sendContext } from "../src/application/services/send-context.js";
import { getMessagesByConversation, getUnreadMessages } from "../src/application/services/get-messages.js";
import { assignTask } from "../src/application/services/assign-task.js";
import { reportStatus } from "../src/application/services/report-status.js";
import { randomUUID } from "node:crypto";
import { createTestBridgeDb } from "./helpers.js";

let db: DbClient;

beforeEach(() => {
  ({ db } = createTestBridgeDb());
});

describe("sendContext", () => {
  it("inserts a message and returns it", () => {
    const conv = randomUUID();
    const result = sendContext(db, {
      conversation: conv,
      sender: "claude-code",
      recipient: "codex",
      payload: "Hello from Claude",
      meta_prompt: "Analyze this codebase",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversation).toBe(conv);
    expect(result.data.sender).toBe("claude-code");
    expect(result.data.recipient).toBe("codex");
    expect(result.data.kind).toBe("context");
    expect(result.data.payload).toBe("Hello from Claude");
    expect(result.data.meta_prompt).toBe("Analyze this codebase");
    expect(result.data.read_at).toBeNull();
  });
});

describe("getMessages", () => {
  it("returns messages in chronological order", () => {
    const conv = randomUUID();
    sendContext(db, { conversation: conv, sender: "a", recipient: "b", payload: "first" });
    sendContext(db, { conversation: conv, sender: "b", recipient: "a", payload: "second" });

    const result = getMessagesByConversation(db, conv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(2);
    expect(result.data[0].payload).toBe("first");
    expect(result.data[1].payload).toBe("second");
  });

  it("returns empty array for unknown conversation", () => {
    const result = getMessagesByConversation(db, randomUUID());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(0);
  });
});

describe("getUnreadMessages", () => {
  it("returns unread messages and marks them read", () => {
    const conv = randomUUID();
    sendContext(db, { conversation: conv, sender: "a", recipient: "b", payload: "msg1" });
    sendContext(db, { conversation: conv, sender: "a", recipient: "b", payload: "msg2" });

    // First call returns 2 unread
    const first = getUnreadMessages(db, "b");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data).toHaveLength(2);

    // Second call returns 0 (already read)
    const second = getUnreadMessages(db, "b");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data).toHaveLength(0);
  });
});

describe("assignTask", () => {
  it("creates a task and a conversation message atomically", () => {
    const conv = randomUUID();
    const result = assignTask(db, {
      conversation: conv,
      domain: "backend",
      summary: "Fix auth bug",
      details: "JWT validation is missing",
      assigned_to: "codex",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.domain).toBe("backend");
    expect(result.data.status).toBe("pending");

    // Check that a message was also created
    const msgs = getMessagesByConversation(db, conv);
    expect(msgs.ok).toBe(true);
    if (!msgs.ok) return;
    expect(msgs.data).toHaveLength(1);
    expect(msgs.data[0].kind).toBe("task");
  });
});

describe("reportStatus", () => {
  it("inserts a status message and updates associated task", () => {
    const conv = randomUUID();
    const taskResult = assignTask(db, {
      conversation: conv,
      domain: "frontend",
      summary: "Build dashboard",
      details: "Create React components",
      assigned_to: "codex",
    });
    if (!taskResult.ok) return;

    const result = reportStatus(db, {
      conversation: conv,
      sender: "codex",
      recipient: "claude-code",
      task_id: taskResult.data.id,
      status: "completed",
      payload: "Dashboard built with 3 components",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.task_updated).toBe(true);

    // Verify task status was updated
    const task = db.getTask(taskResult.data.id);
    expect(task?.status).toBe("completed");
  });

  it("returns error for unknown task_id without inserting a message", () => {
    const conv = randomUUID();
    const result = reportStatus(db, {
      conversation: conv,
      sender: "codex",
      recipient: "claude-code",
      task_id: randomUUID(),
      status: "completed",
      payload: "Done",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");

    // Verify no orphaned message was created
    const msgs = getMessagesByConversation(db, conv);
    expect(msgs.ok).toBe(true);
    if (!msgs.ok) return;
    expect(msgs.data).toHaveLength(0);
  });
});
