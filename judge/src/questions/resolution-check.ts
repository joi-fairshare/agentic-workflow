import { z } from "zod";

import type { QuestionModule } from "../question.js";

// The ticket brief is sent verbatim so the model judges against what was
// actually reported, not the orchestrator's own summary of it. Capped so one
// huge ticket body can't blow the provider's prompt budget; the marker keeps
// the cut visible to the model.
export const BRIEF_CAP = 8000;

export const ResolutionCheckInputSchema = z.object({
  // An empty brief leaves nothing to judge against: failing the schema makes
  // evaluate() escalate ("invalid-input") instead of deciding.
  brief: z.string().refine((s) => s.trim() !== "", "brief is empty"),
  expected: z.string(),
  actual: z.string(),
  rootCause: z.string(),
  checkKind: z.enum(["ui-evidence", "test"]),
  checkSummary: z.string(),
  beforePassed: z.boolean(),
  afterPassed: z.boolean(),
  diffStat: z.string(),
});
export type ResolutionCheckInput = z.infer<typeof ResolutionCheckInputSchema>;

function cappedBrief(brief: string): string {
  if (brief.length <= BRIEF_CAP) return brief;
  return `${brief.slice(0, BRIEF_CAP)}\n[truncated ${brief.length - BRIEF_CAP} chars]`;
}

// Second opinion for /bugFixOrchestrator: the hard check (same ui-evidence
// script or regression test, failing before and passing after) is the gate;
// this asks whether that check plus the diff cover the problem as reported.
export const resolutionCheck: QuestionModule<ResolutionCheckInput, "resolved" | "partial" | "unresolved"> = {
  name: "resolution-check",
  inputSchema: ResolutionCheckInputSchema,
  outputs: ["resolved", "partial", "unresolved"],
  contentClass: "brief",
  timeBudgetMs: 15000,
  threshold: 0.8,
  extraProperties: { reasons: { type: "array", items: { type: "string" } } },
  preRules: (input) => {
    if (!input.afterPassed) return "unresolved";
    // A check that already passed on the unfixed code never reproduced the bug,
    // so its passing now proves nothing.
    if (input.beforePassed) return "unresolved";
    return null;
  },
  prompt: (input) =>
    [
      "A bug ticket, as reported:",
      "<brief>",
      cappedBrief(input.brief),
      "</brief>",
      `Expected behaviour: ${input.expected}`,
      `Actual behaviour before the fix: ${input.actual}`,
      `Confirmed root cause: ${input.rootCause}`,
      `A ${input.checkKind === "ui-evidence" ? "browser UI check" : "regression test"} failed before the fix and passes after it: ${input.checkSummary}`,
      `Diff stat of the fix: ${input.diffStat}`,
      "Does the passing check, together with this diff, resolve the problem as reported in the brief?",
      'Reply {"decision":"resolved","reasons":[]} only if every part of the brief is covered.',
      'Reply {"decision":"partial","reasons":["..."]} if any part of the brief is not covered by the check, or if the diff hides the symptom without addressing the root cause.',
      'Reply {"decision":"unresolved","reasons":["..."]} if the check or diff does not address the reported problem at all.',
    ].join("\n"),
};
