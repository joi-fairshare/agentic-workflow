import { z } from "zod";

export const ScriptStepSchema = z.object({
  action: z.enum(["goto", "click", "fill", "expect-visible"]),
  target: z.string(),
  value: z.string().optional(),
  expectedState: z.string(),
});
export type ScriptStep = z.infer<typeof ScriptStepSchema>;

export const UiScriptSchema = z.object({
  route: z.string(),
  role: z.enum(["manager", "staff", "central-staffer", "super-admin"]),
  steps: z.array(ScriptStepSchema).min(1),
  viewports: z.array(z.enum(["desktop", "phone"])).min(1),
});
export type UiScript = z.infer<typeof UiScriptSchema>;

export function parseUiScript(raw: unknown): UiScript | { error: string } {
  const parsed = UiScriptSchema.safeParse(raw);
  return parsed.success ? parsed.data : { error: parsed.error.message };
}
