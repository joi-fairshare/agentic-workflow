import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { type DbClient } from "../src/db/client.js";
import { sendContext } from "../src/application/services/send-context.js";
import { assignTask } from "../src/application/services/assign-task.js";
import { getConversations } from "../src/application/services/get-conversations.js";
import { randomUUID } from "node:crypto";
import { createTestBridgeDb } from "./helpers.js";

let db: DbClient;
let raw: Database.Database;

beforeEach(() => {
  ({ db, raw } = createTestBridgeDb());
});

describe("getConversations", () => {
  it("returns conversation summaries with counts", () => {
    const conv1 = randomUUID();
    const conv2 = randomUUID();

    // conv1: 2 direct messages + 1 system message from assignTask + 1 task
    sendContext(db, { conversation: conv1, sender: "a", recipient: "b", payload: "msg1" });
    sendContext(db, { conversation: conv1, sender: "b", recipient: "a", payload: "msg2" });
    assignTask(db, { conversation: conv1, domain: "code", summary: "do thing", details: "details" });

    // conv2: 1 message, 0 tasks
    sendContext(db, { conversation: conv2, sender: "a", recipient: "c", payload: "msg3" });

    const result = getConversations(db, { limit: 10, offset: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.conversations).toHaveLength(2);
    expect(result.data.total).toBe(2);

    // conv1 has 3 messages (2 sendContext + 1 system from assignTask) and 1 task
    const c1 = result.data.conversations.find((c) => c.conversation === conv1)!;
    expect(c1.message_count).toBe(3);
    expect(c1.task_count).toBe(1);

    // conv2 has 1 message, 0 tasks
    const c2 = result.data.conversations.find((c) => c.conversation === conv2)!;
    expect(c2.message_count).toBe(1);
    expect(c2.task_count).toBe(0);
  });

  it("respects limit and offset for pagination", () => {
    // Create 3 conversations
    for (let i = 0; i < 3; i++) {
      sendContext(db, { conversation: randomUUID(), sender: "a", recipient: "b", payload: `msg${i}` });
    }

    const page1 = getConversations(db, { limit: 2, offset: 0 });
    expect(page1.ok).toBe(true);
    if (!page1.ok) return;
    expect(page1.data.conversations).toHaveLength(2);
    expect(page1.data.total).toBe(3);

    const page2 = getConversations(db, { limit: 2, offset: 2 });
    expect(page2.ok).toBe(true);
    if (!page2.ok) return;
    expect(page2.data.conversations).toHaveLength(1);
    expect(page2.data.total).toBe(3);
  });

  it("returns empty array when no data exists", () => {
    const result = getConversations(db, { limit: 10, offset: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversations).toHaveLength(0);
    expect(result.data.total).toBe(0);
  });

  it("orders by last_activity descending", () => {
    const older = randomUUID();
    const newer = randomUUID();

    sendContext(db, { conversation: older, sender: "a", recipient: "b", payload: "old" });
    sendContext(db, { conversation: newer, sender: "a", recipient: "b", payload: "new" });

    // Force distinct timestamps to avoid wall-clock flakiness
    raw.prepare("UPDATE messages SET created_at = '2025-01-01T00:00:00.000Z' WHERE conversation = ?").run(older);
    raw.prepare("UPDATE messages SET created_at = '2025-01-02T00:00:00.000Z' WHERE conversation = ?").run(newer);

    const result = getConversations(db, { limit: 10, offset: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.conversations[0].conversation).toBe(newer);
    expect(result.data.conversations[1].conversation).toBe(older);
  });
});
