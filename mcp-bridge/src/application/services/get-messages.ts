import type { DbClient, MessageRow } from "../../db/client.js";
import type { AppResult } from "../result.js";
import { ok } from "../result.js";

export function getMessagesByConversation(
  db: DbClient,
  conversation: string,
): AppResult<MessageRow[]> {
  const rows = db.getMessagesByConversation(conversation);
  return ok(rows);
}

export function getUnreadMessages(
  db: DbClient,
  recipient: string,
): AppResult<MessageRow[]> {
  const rows = db.getUnreadMessages(recipient);
  // Mark as read on retrieval
  for (const row of rows) {
    db.markRead(row.id);
  }
  return ok(rows);
}
