import type { DbClient, MessageRow } from "../../db/client.js";
import type { AppResult } from "../result.js";
import { ok, err, ERROR_CODE } from "../result.js";

export interface ReportStatusInput {
  conversation: string;
  sender: string;
  recipient: string;
  task_id?: string;
  status: "in_progress" | "completed" | "failed";
  payload: string;
}

export interface ReportStatusResult {
  message_id: string;
  task_updated: boolean;
}

export function reportStatus(
  db: DbClient,
  input: ReportStatusInput,
): AppResult<ReportStatusResult> {
  // Insert the status message
  const msg = db.insertMessage({
    conversation: input.conversation,
    sender: input.sender,
    recipient: input.recipient,
    kind: "status",
    payload: input.payload,
    meta_prompt: null,
  });

  // Update the task if a task_id was provided
  let taskUpdated = false;
  if (input.task_id) {
    const task = db.getTask(input.task_id);
    if (!task) {
      return err({
        code: ERROR_CODE.notFound,
        message: `Task ${input.task_id} not found`,
        statusHint: 404,
      });
    }
    db.updateTaskStatus(input.task_id, input.status, input.payload);
    taskUpdated = true;
  }

  return ok({
    message_id: msg.id,
    task_updated: taskUpdated,
  });
}
