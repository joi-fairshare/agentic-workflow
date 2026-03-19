import { z } from "zod";
import { ConversationParamsSchema, IdParamsSchema } from "./common.js";

// ── Response shape ─────────────────────────────────────────

export const TaskResponseSchema = z.object({
  id: z.string().uuid(),
  conversation: z.string().uuid(),
  domain: z.string(),
  summary: z.string(),
  details: z.string(),
  analysis: z.string().nullable(),
  assigned_to: z.string().nullable(),
  status: z.enum(["pending", "in_progress", "completed", "failed"]),
  created_at: z.string(),
  updated_at: z.string(),
});
export type TaskResponse = z.infer<typeof TaskResponseSchema>;

// ── assign_task ────────────────────────────────────────────

export const AssignTaskBodySchema = z.object({
  conversation: z.string().uuid(),
  domain: z.string().min(1),
  summary: z.string().min(1),
  details: z.string().min(1),
  analysis: z.string().optional(),
  assigned_to: z.string().optional(),
});
export type AssignTaskBody = z.infer<typeof AssignTaskBodySchema>;

export const AssignTaskSchema = {
  body: AssignTaskBodySchema,
  response: TaskResponseSchema,
} as const;
export type AssignTaskSchema = typeof AssignTaskSchema;

// ── get task ───────────────────────────────────────────────

export const GetTaskSchema = {
  params: IdParamsSchema,
  response: TaskResponseSchema,
} as const;
export type GetTaskSchema = typeof GetTaskSchema;

// ── get tasks by conversation ──────────────────────────────

export const GetTasksByConversationSchema = {
  params: ConversationParamsSchema,
  response: z.array(TaskResponseSchema),
} as const;
export type GetTasksByConversationSchema = typeof GetTasksByConversationSchema;

// ── report_status ──────────────────────────────────────────

export const ReportStatusBodySchema = z.object({
  conversation: z.string().uuid(),
  sender: z.string().min(1),
  recipient: z.string().min(1),
  task_id: z.string().uuid().optional(),
  status: z.enum(["in_progress", "completed", "failed"]),
  payload: z.string().min(1),
});
export type ReportStatusBody = z.infer<typeof ReportStatusBodySchema>;

export const ReportStatusSchema = {
  body: ReportStatusBodySchema,
  response: z.object({
    message_id: z.string().uuid(),
    task_updated: z.boolean(),
  }),
} as const;
export type ReportStatusSchema = typeof ReportStatusSchema;
