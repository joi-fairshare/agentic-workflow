import type { DbClient, TaskRow } from "../../db/client.js";
import type { AppResult } from "../result.js";
import { ok } from "../result.js";

export interface AssignTaskInput {
  conversation: string;
  domain: string;
  summary: string;
  details: string;
  analysis?: string;
  assigned_to?: string;
}

export function assignTask(db: DbClient, input: AssignTaskInput): AppResult<TaskRow> {
  const row = db.insertTask({
    conversation: input.conversation,
    domain: input.domain,
    summary: input.summary,
    details: input.details,
    analysis: input.analysis ?? null,
    assigned_to: input.assigned_to ?? null,
  });

  // Also insert a message so the conversation log captures the assignment
  db.insertMessage({
    conversation: input.conversation,
    sender: "system",
    recipient: input.assigned_to ?? "unassigned",
    kind: "task",
    payload: JSON.stringify({
      task_id: row.id,
      domain: input.domain,
      summary: input.summary,
      details: input.details,
    }),
    meta_prompt: null,
  });

  return ok(row);
}
