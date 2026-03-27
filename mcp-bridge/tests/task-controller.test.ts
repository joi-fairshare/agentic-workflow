import { describe, it, expect, beforeEach, vi } from "vitest";
import { type DbClient } from "../src/db/client.js";
import { createTaskController } from "../src/transport/controllers/task-controller.js";
import * as assignTaskService from "../src/application/services/assign-task.js";
import { err } from "../src/application/result.js";
import { randomUUID } from "node:crypto";
import { createTestBridgeDb } from "./helpers.js";

let db: DbClient;
let controller: ReturnType<typeof createTaskController>;

beforeEach(() => {
  ({ db } = createTestBridgeDb());
  controller = createTaskController(db);
});

describe("assign error path", () => {
  it("returns error when assignTask service fails", async () => {
    vi.spyOn(assignTaskService, "assignTask").mockReturnValueOnce(
      err({ code: "INTERNAL_ERROR", message: "DB failure", statusHint: 500 }),
    );
    const result = await controller.assign({
      body: { conversation: randomUUID(), domain: "backend", summary: "Fix bug", details: "JWT broken", assigned_to: "codex" },
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

describe("assign", () => {
  it("creates a task and returns it", async () => {
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
  it("creates status message and updates task when task_id provided", async () => {
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
  });

  it("does not update task when no task_id provided", async () => {
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
