import { z } from "zod";

import type { QuestionModule } from "../question.js";

export interface Candidate {
  index: number;
  role: string | null;
  accessibleName: string | null;
  testId: string | null;
  text: string | null;
}

const CandidateSchema = z.object({
  index: z.number(),
  role: z.string().nullable(),
  accessibleName: z.string().nullable(),
  testId: z.string().nullable(),
  text: z.string().nullable(),
});

export const UiElementRepairInputSchema = z.object({
  brokenSelector: z.string(),
  step: z.string(),
  candidates: z.array(CandidateSchema),
});
export type UiElementRepairInput = z.infer<typeof UiElementRepairInputSchema>;

function describeCandidate(c: Candidate): string {
  return `[${c.index}] role=${c.role ?? "?"} name=${c.accessibleName ?? "?"} testId=${c.testId ?? "?"} text=${c.text ?? "?"}`;
}

// NOTE on the chosenIndex seam: evaluate()'s Decision<O> (Plan 2) only carries
// the enum decision, confidence, model, reason_code and id — it has no field
// for "which candidate." The chosen index still rides inside the same
// --json-schema response the claude-cli provider parses (Plan 2, Task 4).
// judge's CLI exposes it via a dedicated thin subcommand
// (`judge ui-element-repair` in cli.ts) that prints `{decision, chosenIndex}`
// instead of the generic `{decision, confidence, model, reason_code, id}`
// shape every other question's CLI invocation returns — the same pattern
// visual-critique.ts uses for its own `reasons` field. This keeps judge's own
// Decision<O> contract (Plan 2) completely unmodified.
export const uiElementRepair: QuestionModule<UiElementRepairInput, "repaired" | "no-good-candidate"> = {
  name: "ui-element-repair",
  inputSchema: UiElementRepairInputSchema,
  outputs: ["repaired", "no-good-candidate"],
  contentClass: "code",
  timeBudgetMs: 10000,
  threshold: 0.6,
  preRules: (input) => (input.candidates.length === 0 ? "no-good-candidate" : null),
  extraProperties: { chosenIndex: { type: "integer" } },
  prompt: (input) =>
    [
      `A Playwright step failed: "${input.step}" could not find "${input.brokenSelector}".`,
      "Here are the other elements found on the page at that moment:",
      ...input.candidates.map(describeCandidate),
      'Reply {"decision":"repaired","chosenIndex":N} if one candidate clearly matches the step\'s intent, or {"decision":"no-good-candidate"} if none do. Never guess.',
    ].join("\n"),
};
