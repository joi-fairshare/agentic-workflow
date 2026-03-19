import { z } from "zod";
import { ConversationParamsSchema, RecipientQuerySchema } from "./common.js";

// ── Response shape ─────────────────────────────────────────

export const MessageResponseSchema = z.object({
  id: z.string().uuid(),
  conversation: z.string().uuid(),
  sender: z.string(),
  recipient: z.string(),
  kind: z.enum(["context", "task", "status", "reply"]),
  payload: z.string(),
  meta_prompt: z.string().nullable(),
  created_at: z.string(),
  read_at: z.string().nullable(),
});
export type MessageResponse = z.infer<typeof MessageResponseSchema>;

// ── send_context ───────────────────────────────────────────

export const SendContextBodySchema = z.object({
  conversation: z.string().uuid(),
  sender: z.string().min(1),
  recipient: z.string().min(1),
  payload: z.string().min(1),
  meta_prompt: z.string().optional(),
});
export type SendContextBody = z.infer<typeof SendContextBodySchema>;

export const SendContextSchema = {
  body: SendContextBodySchema,
  response: MessageResponseSchema,
} as const;
export type SendContextSchema = typeof SendContextSchema;

// ── get_messages ───────────────────────────────────────────

export const GetMessagesSchema = {
  params: ConversationParamsSchema,
  response: z.array(MessageResponseSchema),
} as const;
export type GetMessagesSchema = typeof GetMessagesSchema;

// ── get_unread ─────────────────────────────────────────────

export const GetUnreadSchema = {
  querystring: RecipientQuerySchema,
  response: z.array(MessageResponseSchema),
} as const;
export type GetUnreadSchema = typeof GetUnreadSchema;
