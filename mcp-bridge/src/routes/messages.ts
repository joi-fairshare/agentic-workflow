import type { DbClient } from "../db/client.js";
import { createMessageController } from "../transport/controllers/message-controller.js";
import { defineRoute, type ControllerDefinition, type RouteEntry } from "../transport/types.js";
import {
  SendContextSchema,
  GetMessagesSchema,
  GetUnreadSchema,
} from "../transport/schemas/message-schemas.js";

export function createMessageRoutes(db: DbClient): ControllerDefinition {
  const handlers = createMessageController(db);

  return {
    basePath: "/messages",
    routes: [
      defineRoute({
        method: "POST",
        path: "/send",
        summary: "Send context from one agent to another",
        schema: SendContextSchema,
        handler: handlers.send,
      }),
      defineRoute({
        method: "GET",
        path: "/conversation/:conversation",
        summary: "Get all messages for a conversation",
        schema: GetMessagesSchema,
        handler: handlers.getByConversation,
      }),
      defineRoute({
        method: "GET",
        path: "/unread",
        summary: "Get unread messages for a recipient",
        schema: GetUnreadSchema,
        handler: handlers.getUnread,
      }),
    ] as RouteEntry[],
  };
}
