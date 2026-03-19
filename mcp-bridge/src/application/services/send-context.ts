import type { DbClient, MessageRow } from "../../db/client.js";
import type { AppResult } from "../result.js";
import { ok } from "../result.js";

export interface SendContextInput {
  conversation: string;
  sender: string;
  recipient: string;
  payload: string;
  meta_prompt?: string;
}

export function sendContext(db: DbClient, input: SendContextInput): AppResult<MessageRow> {
  const row = db.insertMessage({
    conversation: input.conversation,
    sender: input.sender,
    recipient: input.recipient,
    kind: "context",
    payload: input.payload,
    meta_prompt: input.meta_prompt ?? null,
  });
  return ok(row);
}
