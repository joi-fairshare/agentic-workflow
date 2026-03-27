import type { DbClient } from "../db/client.js";
import { createTaskController } from "../transport/controllers/task-controller.js";
import { defineRoute, type ControllerDefinition, type RouteEntry } from "../transport/types.js";
import {
  AssignTaskSchema,
  GetTaskSchema,
  GetTasksByConversationSchema,
  ReportStatusSchema,
} from "../transport/schemas/task-schemas.js";

export function createTaskRoutes(db: DbClient): ControllerDefinition {
  const handlers = createTaskController(db);

  return {
    basePath: "/tasks",
    routes: [
      defineRoute({
        method: "POST",
        path: "/assign",
        summary: "Assign a task with domain and implementation details",
        schema: AssignTaskSchema,
        handler: handlers.assign,
      }),
      defineRoute({
        method: "GET",
        path: "/:id",
        summary: "Get a task by ID",
        schema: GetTaskSchema,
        handler: handlers.get,
      }),
      defineRoute({
        method: "GET",
        path: "/conversation/:conversation",
        summary: "Get all tasks for a conversation",
        schema: GetTasksByConversationSchema,
        handler: handlers.getByConversation,
      }),
      defineRoute({
        method: "POST",
        path: "/report",
        summary: "Report status back with feedback or completion",
        schema: ReportStatusSchema,
        handler: handlers.report,
      }),
    ] as RouteEntry[],
  };
}
