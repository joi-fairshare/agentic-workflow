import { describe, it, expect, beforeEach } from "vitest";
import { type DbClient } from "../src/db/client.js";
import { randomUUID } from "node:crypto";
import { createTestBridgeDb } from "./helpers.js";

let db: DbClient;

beforeEach(() => {
  ({ db } = createTestBridgeDb());
});

describe("insertMessage + getMessage", () => {
  it("inserts and retrieves a message with generated id, created_at, and null read_at", () => {
    const msg = db.insertMessage({
      conversation: randomUUID(),
      sender: "alice",
      recipient: "bob",
      kind: "context",
      payload: "hello",
      meta_prompt: "think carefully",
    });

    expect(msg.id).toBeTruthy();
    expect(msg.created_at).toBeTruthy();
    expect(msg.read_at).toBeNull();
    expect(msg.sender).toBe("alice");
    expect(msg.meta_prompt).toBe("think carefully");

    const fetched = db.getMessage(msg.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(msg.id);
    expect(fetched!.payload).toBe("hello");
  });

  it("returns undefined for non-existent message id", () => {
    expect(db.getMessage(randomUUID())).toBeUndefined();
  });

  it("handles null meta_prompt", () => {
    const msg = db.insertMessage({
      conversation: randomUUID(),
      sender: "a",
      recipient: "b",
      kind: "context",
      payload: "test",
      meta_prompt: null,
    });
    expect(msg.meta_prompt).toBeNull();
  });
});

describe("getMessagesByConversation", () => {
  it("returns messages in chronological order for a conversation", () => {
    const conv = randomUUID();
    db.insertMessage({ conversation: conv, sender: "a", recipient: "b", kind: "context", payload: "first", meta_prompt: null });
    db.insertMessage({ conversation: conv, sender: "b", recipient: "a", kind: "reply", payload: "second", meta_prompt: null });

    const msgs = db.getMessagesByConversation(conv);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].payload).toBe("first");
    expect(msgs[1].payload).toBe("second");
  });

  it("returns empty array for unknown conversation", () => {
    expect(db.getMessagesByConversation(randomUUID())).toHaveLength(0);
  });

  it("does not return messages from other conversations", () => {
    const conv1 = randomUUID();
    const conv2 = randomUUID();
    db.insertMessage({ conversation: conv1, sender: "a", recipient: "b", kind: "context", payload: "c1", meta_prompt: null });
    db.insertMessage({ conversation: conv2, sender: "a", recipient: "b", kind: "context", payload: "c2", meta_prompt: null });

    const msgs = db.getMessagesByConversation(conv1);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].payload).toBe("c1");
  });
});

describe("getUnreadMessages", () => {
  it("returns unread messages for a recipient", () => {
    const conv = randomUUID();
    db.insertMessage({ conversation: conv, sender: "a", recipient: "bob", kind: "context", payload: "msg1", meta_prompt: null });
    db.insertMessage({ conversation: conv, sender: "a", recipient: "bob", kind: "context", payload: "msg2", meta_prompt: null });

    const unread = db.getUnreadMessages("bob");
    expect(unread).toHaveLength(2);
  });

  it("does not return messages for a different recipient", () => {
    const conv = randomUUID();
    db.insertMessage({ conversation: conv, sender: "a", recipient: "bob", kind: "context", payload: "msg", meta_prompt: null });

    expect(db.getUnreadMessages("alice")).toHaveLength(0);
  });

  it("does not return already-read messages", () => {
    const conv = randomUUID();
    const msg = db.insertMessage({ conversation: conv, sender: "a", recipient: "bob", kind: "context", payload: "msg", meta_prompt: null });
    db.markRead(msg.id);

    expect(db.getUnreadMessages("bob")).toHaveLength(0);
  });
});

describe("markRead", () => {
  it("sets read_at on a message", () => {
    const msg = db.insertMessage({ conversation: randomUUID(), sender: "a", recipient: "b", kind: "context", payload: "test", meta_prompt: null });
    expect(msg.read_at).toBeNull();

    db.markRead(msg.id);
    const updated = db.getMessage(msg.id);
    expect(updated!.read_at).toBeTruthy();
  });

  it("is a no-op for non-existent id", () => {
    db.markRead(randomUUID());
  });
});

describe("markAllRead", () => {
  it("marks all unread messages for a recipient as read", () => {
    const conv = randomUUID();
    db.insertMessage({ conversation: conv, sender: "a", recipient: "bob", kind: "context", payload: "m1", meta_prompt: null });
    db.insertMessage({ conversation: conv, sender: "a", recipient: "bob", kind: "context", payload: "m2", meta_prompt: null });
    db.insertMessage({ conversation: conv, sender: "a", recipient: "alice", kind: "context", payload: "m3", meta_prompt: null });

    db.markAllRead("bob");

    expect(db.getUnreadMessages("bob")).toHaveLength(0);
    expect(db.getUnreadMessages("alice")).toHaveLength(1);
  });

  it("is a no-op when no unread messages exist", () => {
    db.markAllRead("nobody");
  });
});

describe("insertTask + getTask", () => {
  it("inserts and retrieves a task with generated id, timestamps, and pending status", () => {
    const task = db.insertTask({
      conversation: randomUUID(),
      domain: "backend",
      summary: "Fix auth",
      details: "JWT missing",
      analysis: "Review tokens",
      assigned_to: "codex",
    });

    expect(task.id).toBeTruthy();
    expect(task.status).toBe("pending");
    expect(task.created_at).toBeTruthy();
    expect(task.updated_at).toBeTruthy();
    expect(task.analysis).toBe("Review tokens");
    expect(task.assigned_to).toBe("codex");

    const fetched = db.getTask(task.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(task.id);
  });

  it("returns undefined for non-existent task id", () => {
    expect(db.getTask(randomUUID())).toBeUndefined();
  });

  it("handles null analysis and assigned_to", () => {
    const task = db.insertTask({
      conversation: randomUUID(),
      domain: "frontend",
      summary: "Build UI",
      details: "React components",
      analysis: null,
      assigned_to: null,
    });
    expect(task.analysis).toBeNull();
    expect(task.assigned_to).toBeNull();
  });
});

describe("getTasksByConversation", () => {
  it("returns tasks for a conversation in chronological order", () => {
    const conv = randomUUID();
    db.insertTask({ conversation: conv, domain: "a", summary: "first", details: "d1", analysis: null, assigned_to: null });
    db.insertTask({ conversation: conv, domain: "b", summary: "second", details: "d2", analysis: null, assigned_to: null });

    const tasks = db.getTasksByConversation(conv);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].summary).toBe("first");
    expect(tasks[1].summary).toBe("second");
  });

  it("returns empty array for unknown conversation", () => {
    expect(db.getTasksByConversation(randomUUID())).toHaveLength(0);
  });
});

describe("updateTaskStatus", () => {
  it("updates status and updated_at", () => {
    const task = db.insertTask({ conversation: randomUUID(), domain: "x", summary: "s", details: "d", analysis: null, assigned_to: null });
    const originalUpdatedAt = task.updated_at;

    db.updateTaskStatus(task.id, "completed");
    const updated = db.getTask(task.id);
    expect(updated!.status).toBe("completed");
    expect(updated!.updated_at >= originalUpdatedAt).toBe(true);
  });

  it("updates analysis when provided", () => {
    const task = db.insertTask({ conversation: randomUUID(), domain: "x", summary: "s", details: "d", analysis: null, assigned_to: null });

    db.updateTaskStatus(task.id, "in_progress", "new analysis");
    const updated = db.getTask(task.id);
    expect(updated!.analysis).toBe("new analysis");
  });

  it("preserves existing analysis when not provided", () => {
    const task = db.insertTask({ conversation: randomUUID(), domain: "x", summary: "s", details: "d", analysis: "original", assigned_to: null });

    db.updateTaskStatus(task.id, "completed");
    const updated = db.getTask(task.id);
    expect(updated!.analysis).toBe("original");
  });

  it("is a no-op for non-existent task id", () => {
    db.updateTaskStatus(randomUUID(), "completed");
  });
});

describe("transaction", () => {
  it("commits when function succeeds", () => {
    const conv = randomUUID();
    const result = db.transaction(() => {
      const msg = db.insertMessage({ conversation: conv, sender: "a", recipient: "b", kind: "context", payload: "test", meta_prompt: null });
      const task = db.insertTask({ conversation: conv, domain: "x", summary: "s", details: "d", analysis: null, assigned_to: null });
      return { msg, task };
    });

    expect(db.getMessage(result.msg.id)).toBeDefined();
    expect(db.getTask(result.task.id)).toBeDefined();
  });

  it("rolls back when function throws", () => {
    const conv = randomUUID();
    expect(() => {
      db.transaction(() => {
        db.insertMessage({ conversation: conv, sender: "a", recipient: "b", kind: "context", payload: "test", meta_prompt: null });
        throw new Error("intentional");
      });
    }).toThrow("intentional");

    expect(db.getMessagesByConversation(conv)).toHaveLength(0);
  });
});

describe("getConversations + getConversationCount", () => {
  it("returns conversation summaries with counts", () => {
    const conv = randomUUID();
    db.insertMessage({ conversation: conv, sender: "a", recipient: "b", kind: "context", payload: "m", meta_prompt: null });
    db.insertTask({ conversation: conv, domain: "x", summary: "s", details: "d", analysis: null, assigned_to: null });

    const summaries = db.getConversations(10, 0);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].conversation).toBe(conv);
    expect(summaries[0].message_count).toBe(1);
    expect(summaries[0].task_count).toBe(1);
    expect(summaries[0].last_activity).toBeTruthy();
  });

  it("returns empty array for empty database", () => {
    expect(db.getConversations(10, 0)).toHaveLength(0);
    expect(db.getConversationCount()).toBe(0);
  });

  it("respects limit and offset", () => {
    for (let i = 0; i < 3; i++) {
      db.insertMessage({ conversation: randomUUID(), sender: "a", recipient: "b", kind: "context", payload: `m${i}`, meta_prompt: null });
    }

    expect(db.getConversations(2, 0)).toHaveLength(2);
    expect(db.getConversations(2, 2)).toHaveLength(1);
    expect(db.getConversationCount()).toBe(3);
  });
});
