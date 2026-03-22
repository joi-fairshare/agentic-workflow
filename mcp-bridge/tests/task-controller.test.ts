import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { createDbClient, type DbClient } from "../src/db/client.js";
import { MIGRATIONS } from "../src/db/schema.js";
import { createEventBus, type EventBus, type BridgeEvent } from "../src/application/events.js";
import { createTaskController } from "../src/transport/controllers/task-controller.js";
import { randomUUID } from "node:crypto";

let db: DbClient;
let eventBus: EventBus;
let events: BridgeEvent[];
let controller: ReturnType<typeof createTaskController>;

beforeEach(() => {
  const raw = new Database(":memory:");
  raw.pragma("journal_mode = WAL");
  raw.exec(MIGRATIONS);
  db = createDbClient(raw);
  eventBus = createEventBus();
  events = [];
  eventBus.subscribe((e) => events.push(e));
  controller = createTaskController(db, eventBus);
});

describe("assign", () => {
  it("creates a task and emits task:created event", async () => {
    const conv = randomUUID();
    const result = await controller.assign({
      body: { conversation: conv, domain: "backend", summary: "Fix bug", details: "JWT broken", assigned_to: "codex" },
      params: undefined as never,
      query: undefined as never,
      requestId: "test",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.domain).toBe("backend");
    expect(result.data.status).toBe("pending");

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("task:created");
  });
});

describe("get", () => {
  it("returns a task by id", async () => {
    const task = db.insertTask({ conversation: randomUUID(), domain: "x", summary: "s", details: "d", analysis: null, assigned_to: null });

    const result = await controller.get({
      params: { id: task.id },
      body: undefined as never,
      query: undefined as never,
      requestId: "test",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toBe(task.id);
  });

  it("returns NOT_FOUND for non-existent task", async () => {
    const result = await controller.get({
      params: { id: randomUUID() },
      body: undefined as never,
      query: undefined as never,
      requestId: "test",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("getByConversation", () => {
  it("returns tasks for a conversation", async () => {
    const conv = randomUUID();
    db.insertTask({ conversation: conv, domain: "x", summary: "s", details: "d", analysis: null, assigned_to: null });

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
});

describe("report", () => {
  it("creates status message and emits task:updated when task_id provided", async () => {
    const conv = randomUUID();
    const task = db.insertTask({ conversation: conv, domain: "x", summary: "s", details: "d", analysis: null, assigned_to: null });

    const result = await controller.report({
      body: { conversation: conv, sender: "codex", recipient: "claude", task_id: task.id, status: "completed", payload: "Done" },
      params: undefined as never,
      query: undefined as never,
      requestId: "test",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.task_updated).toBe(true);

    // Should emit task:updated
    const taskEvents = events.filter((e) => e.type === "task:updated");
    expect(taskEvents).toHaveLength(1);
    expect(taskEvents[0].data.status).toBe("completed");
  });

  it("does not emit task:updated when no task_id provided", async () => {
    const conv = randomUUID();
    const result = await controller.report({
      body: { conversation: conv, sender: "codex", recipient: "claude", status: "completed", payload: "Done" },
      params: undefined as never,
      query: undefined as never,
      requestId: "test",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.task_updated).toBe(false);
    expect(events.filter((e) => e.type === "task:updated")).toHaveLength(0);
  });

  it("returns NOT_FOUND for non-existent task_id", async () => {
    const conv = randomUUID();
    const result = await controller.report({
      body: { conversation: conv, sender: "codex", recipient: "claude", task_id: randomUUID(), status: "completed", payload: "Done" },
      params: undefined as never,
      query: undefined as never,
      requestId: "test",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});
