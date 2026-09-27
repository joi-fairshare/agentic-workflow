import { z } from "zod";

import type { QuestionModule } from "../question.js";

export const VisualCritiqueInputSchema = z.object({
  afterScreenshot: z.string(),
  baselineScreenshot: z.string().nullable(),
  evidenceDir: z.string(),
});
export type VisualCritiqueInput = z.infer<typeof VisualCritiqueInputSchema>;

// No pre-rule: whether a screenshot "looks right" is exactly the judgment
// call this question exists to make, not something a deterministic rule
// could substitute for.
export const visualCritique: QuestionModule<VisualCritiqueInput, "looks-right" | "looks-off" | "sloppy"> = {
  name: "visual-critique",
  inputSchema: VisualCritiqueInputSchema,
  outputs: ["looks-right", "looks-off", "sloppy"],
  contentClass: "image",
  timeBudgetMs: 20000,
  threshold: 0.5,
  prompt: (input) =>
    [
      `Use the Read tool to look at ${input.afterScreenshot}.`,
      input.baselineScreenshot !== null
        ? `Then look at ${input.baselineScreenshot}, a screenshot of the same page on main before this change, and compare them.`
        : "There is no main-branch screenshot to compare against — judge it on its own.",
      "Rate alignment, spacing, typographic hierarchy, visual weight, and consistency with the reference (when given).",
      'Reply {"decision":"looks-right","reasons":[]} if it looks right, or {"decision":"looks-off","reasons":["..."]} or {"decision":"sloppy","reasons":["..."]} listing the specific problems. Never guess "looks-right" if anything looks wrong.',
    ].join("\n"),
};
