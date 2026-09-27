import { z } from "zod";

import type { QuestionModule } from "../question.js";

const EXEMPT_AGENT_TYPES = new Set(["Explore", "claude-code-guide", "lean-researcher"]);

export const BriefScopeInputSchema = z.object({
  agentType: z.string(),
  goal: z.string(),
  acceptanceCriteria: z.string(),
  proofCommand: z.string(),
  // Spec F13: a skill's own internal orchestration dispatch (e.g. a plan
  // skill fanning out its own review-lens subagents) is exempt from the
  // scope gate the same way a read-only agent type is — it isn't the user
  // authorizing new scope, it's a skill executing its own already-approved
  // steps. Convention: the dispatching skill sets this true on its own
  // Agent call's tool_input (documented in scope-gate.sh).
  skillInternal: z.boolean().optional(),
});
export type BriefScopeInput = z.infer<typeof BriefScopeInputSchema>;

export const briefScope: QuestionModule<BriefScopeInput, "ready" | "missing" | "needs_design"> = {
  name: "brief-scope",
  inputSchema: BriefScopeInputSchema,
  outputs: ["ready", "missing", "needs_design"],
  contentClass: "brief",
  timeBudgetMs: 10000,
  threshold: 0.6,
  preRules: (input) => {
    if (EXEMPT_AGENT_TYPES.has(input.agentType)) return "ready";
    if (input.skillInternal === true) return "ready";
    if (input.goal.trim() === "" || input.acceptanceCriteria.trim() === "") return "missing";
    return null;
  },
  prompt: (input) =>
    [
      `A dispatch brief for agent type "${input.agentType}":`,
      `Goal: ${input.goal}`,
      `Acceptance criteria: ${input.acceptanceCriteria}`,
      `Proof command: ${input.proofCommand}`,
      'Reply {"decision":"ready"} if this is concrete and checkable, {"decision":"missing"} if a required field is present but too vague to act on, or {"decision":"needs_design"} if this needs a design decision before it can be scoped at all.',
    ].join("\n"),
};
