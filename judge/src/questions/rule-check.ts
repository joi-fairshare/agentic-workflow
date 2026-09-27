import { z } from "zod";

import type { QuestionModule } from "../question.js";

export const RuleCheckInputSchema = z.object({
  rule: z.string(),
  hunk: z.string(),
});
export type RuleCheckInput = z.infer<typeof RuleCheckInputSchema>;

export const ruleCheck: QuestionModule<RuleCheckInput, "violated" | "fine" | "n/a"> = {
  name: "rule-check",
  inputSchema: RuleCheckInputSchema,
  outputs: ["violated", "fine", "n/a"],
  contentClass: "diff",
  timeBudgetMs: 10000,
  threshold: 0.6,
  preRules: (input) => {
    if (input.hunk.trim() === "") return "n/a";
    return null;
  },
  prompt: (input) =>
    [
      `Rule: ${input.rule}`,
      "Diff hunk:",
      input.hunk,
      'Reply {"decision":"violated"} if this hunk breaks the rule, {"decision":"fine"} if it doesn\'t, or {"decision":"n/a"} if the rule doesn\'t apply to this hunk at all.',
    ].join("\n"),
};
