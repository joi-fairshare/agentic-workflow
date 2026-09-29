import { z } from "zod";

// A machine-checkable post-step expectation. Free-form prose can't be
// asserted, so the planner must emit one of these shapes; runStep checks it
// after every step, and a step whose expectation fails is never a pass.
export const ExpectedStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text-visible"), text: z.string().min(1) }),
  z.object({ kind: z.literal("text-absent"), text: z.string().min(1) }),
  z.object({ kind: z.literal("testid-visible"), testId: z.string().min(1) }),
  z.object({ kind: z.literal("url-path"), path: z.string().min(1) }),
  z.object({ kind: z.literal("input-value"), testId: z.string().min(1), value: z.string() }),
]);
export type ExpectedState = z.infer<typeof ExpectedStateSchema>;

export const ScriptStepSchema = z.object({
  action: z.enum(["goto", "click", "fill", "expect-visible"]),
  target: z.string(),
  value: z.string().optional(),
  expectedState: ExpectedStateSchema,
});
export type ScriptStep = z.infer<typeof ScriptStepSchema>;

// Provenance for the cost baseline: the planner's one model invocation,
// linked to the run that executes its script. Every field is optional —
// missing usage stays unknown, never zero.
export const PlanningMetaSchema = z.object({
  pr: z.string().optional(),
  model: z.string().optional(),
  elapsedMs: z.number().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
});
export type PlanningMeta = z.infer<typeof PlanningMetaSchema>;

export const UiScriptSchema = z.object({
  route: z.string(),
  role: z.enum(["manager", "staff", "central-staffer", "super-admin"]),
  steps: z.array(ScriptStepSchema).min(1),
  viewports: z.array(z.enum(["desktop", "phone"])).min(1),
  planning: PlanningMetaSchema.optional(),
});
export type UiScript = z.infer<typeof UiScriptSchema>;

export function parseUiScript(raw: unknown): UiScript | { error: string } {
  const parsed = UiScriptSchema.safeParse(raw);
  return parsed.success ? parsed.data : { error: parsed.error.message };
}

export function describeExpectedState(e: ExpectedState): string {
  switch (e.kind) {
    case "text-visible": return `text "${e.text}" visible`;
    case "text-absent": return `text "${e.text}" absent`;
    case "testid-visible": return `element ${e.testId} visible`;
    case "url-path": return `url path ${e.path}`;
    case "input-value": return `input ${e.testId} has value "${e.value}"`;
  }
}
