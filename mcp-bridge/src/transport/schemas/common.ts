import { z } from "zod";

export const IdParamsSchema = z.object({
  id: z.string().uuid(),
});
export type IdParamsSchema = typeof IdParamsSchema;

export const ConversationParamsSchema = z.object({
  conversation: z.string().uuid(),
});
export type ConversationParamsSchema = typeof ConversationParamsSchema;

export const RecipientQuerySchema = z.object({
  recipient: z.string().min(1),
});
export type RecipientQuerySchema = typeof RecipientQuerySchema;
