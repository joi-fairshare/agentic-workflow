import { z } from "zod";

import type { QuestionModule } from "../question.js";

// Deterministic deny list (repo-wide rule: a model never overrides the
// safety-relevant layer). Any next-step text mentioning one of these is
// always "ask", regardless of what a model provider would have said.
const DENY_KEYWORDS = /\b(push|merge|delete|force-push|force push)\b/i;

export const AskCheckInputSchema = z.object({
  transcriptTail: z.string(),
});
export type AskCheckInput = z.infer<typeof AskCheckInputSchema>;

export const askCheck: QuestionModule<AskCheckInput, "continue" | "ask"> = {
  name: "ask-check",
  inputSchema: AskCheckInputSchema,
  outputs: ["continue", "ask"],
  contentClass: "transcript",
  timeBudgetMs: 10000,
  threshold: 0.6,
  preRules: (input) => {
    if (DENY_KEYWORDS.test(input.transcriptTail)) return "ask";
    return null;
  },
  prompt: (input) =>
    [
      "Transcript tail (the agent's last turn):",
      input.transcriptTail,
      'Was the next step already authorized by the dispatch brief or plan? Reply {"decision":"continue"} if so, or {"decision":"ask"} if it needs the user\'s input first.',
    ].join("\n"),
};
