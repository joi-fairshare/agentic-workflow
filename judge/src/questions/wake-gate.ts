import { z } from "zod";

import type { QuestionModule } from "../question.js";

export const WakeGateInputSchema = z.object({
  text: z.string(),
  senderKind: z.enum(["teammate", "subagent", "main", "background"]),
});

export type WakeGateInput = z.infer<typeof WakeGateInputSchema>;
export type WakeGateOutput = "send" | "batch" | "drop";

const ACK_JSON = /^\s*\{\s*"type"\s*:\s*"(ack|idle_notification)"/;
const URGENT_KEYWORDS = /\b(blocked|blocker|failed|error|question|approve|approval)\b/i;
const SHORT_MESSAGE_LEN = 12;

export const wakeGate: QuestionModule<WakeGateInput, WakeGateOutput> = {
  name: "wake-gate",
  inputSchema: WakeGateInputSchema,
  outputs: ["send", "batch", "drop"],
  contentClass: "message-meta",
  threshold: 0.7,
  // claude-cli-class questions default to a 10s budget: a real (non-scratch)
  // login's --json-schema call measured 5.3-6.1s wall, over the original
  // 5s figure from a warm micro-benchmark (2026-09-27, real-HOME smoke).
  timeBudgetMs: 10000,
  prompt: (input) =>
    `A teammate agent wants to send this message to its orchestrator: "${input.text}". ` +
    `Classify it as one of: "send" (a result, failure, blocker, question, or plan change — deliver immediately), ` +
    `"batch" (progress with nothing to act on — queue it), or "drop" (a pure ack with no content). ` +
    `Respond with only the JSON {"decision": "send"|"batch"|"drop"}.`,
  preRules: (input) => {
    const trimmed = input.text.trim();
    if (ACK_JSON.test(trimmed)) return "drop";
    if (URGENT_KEYWORDS.test(trimmed)) return "send";
    if (trimmed.length <= SHORT_MESSAGE_LEN) return "drop";
    return null;
  },
};
