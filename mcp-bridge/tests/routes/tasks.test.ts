import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type DbClient } from "../../src/db/client.js";
import { createEventBus } from "../../src/application/events.js";
import { createTaskRoutes } from "../../src/routes/tasks.js";
import { createServer } from "../../src/server.js";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createTestBridgeDb } from "../helpers.js";

let app: FastifyInstance;
let db: DbClient;

beforeEach(async () => {
  ({ db } = createTestBridgeDb());
  const eventBus = createEventBus();
  const taskRoutes = createTaskRoutes(db, eventBus);
  app = createServer([taskRoutes]);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("POST /tasks/assign", () => {
  it("returns 201 with created task", async () => {
    const conv = randomUUID();
    const res = await app.inject({
      method: "POST",
      url: "/tasks/assign",
      payload: { conversation: conv, domain: "backend", summary: "Fix bug", details: "Details here" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("pending");
    expect(body.data.domain).toBe("backend");
  });

  it("returns 400 for missing required fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/tasks/assign",
      payload: { conversation: randomUUID() },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /tasks/:id", () => {
  it("returns 200 with task", async () => {
    const task = db.insertTask({ conversation: randomUUID(), domain: "x", summary: "s", details: "d", analysis: null, assigned_to: null });

    const res = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(task.id);
  });

  it("returns 404 for non-existent task", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/tasks/${randomUUID()}`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });
});

describe("GET /tasks/conversation/:conversation", () => {
  it("returns 200 with tasks array", async () => {
    const conv = randomUUID();
    db.insertTask({ conversation: conv, domain: "x", summary: "s", details: "d", analysis: null, assigned_to: null });

    const res = await app.inject({
      method: "GET",
      url: `/tasks/conversation/${conv}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });
});

describe("POST /tasks/report", () => {
  it("returns 201 with status report", async () => {
    const conv = randomUUID();
    const task = db.insertTask({ conversation: conv, domain: "x", summary: "s", details: "d", analysis: null, assigned_to: null });

    const res = await app.inject({
      method: "POST",
      url: "/tasks/report",
      payload: { conversation: conv, sender: "codex", recipient: "claude", task_id: task.id, status: "completed", payload: "Done" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.task_updated).toBe(true);
  });

  it("returns 404 for non-existent task_id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/tasks/report",
      payload: { conversation: randomUUID(), sender: "a", recipient: "b", task_id: randomUUID(), status: "completed", payload: "Done" },
    });

    expect(res.statusCode).toBe(404);
  });
});
