// Pure helpers for selector repair. The judge only *proposes* a candidate;
// nothing counts as repaired until the mapped action actually runs against
// that candidate and the step's expected state then passes.
export interface Candidate {
  index: number;
  role: string | null;
  accessibleName: string | null;
  testId: string | null;
  text: string | null;
}

export interface RepairProposal {
  decision: string;
  chosenIndex?: number;
}

/** The candidate the judge chose, only if it is a real, currently-visible one. */
export function resolveCandidate(proposal: RepairProposal | null, visible: readonly Candidate[]): Candidate | null {
  if (proposal === null || proposal.decision !== "repaired") return null;
  const idx = proposal.chosenIndex;
  if (typeof idx !== "number" || !Number.isInteger(idx)) return null;
  return visible.find((c) => c.index === idx) ?? null;
}

/** Legal target kinds per action: a fill must land on something fillable. */
export function candidateFits(action: "click" | "fill", c: Candidate): boolean {
  if (action === "click") return true;
  return c.role === "input" || c.role === "textbox" || c.role === "textarea" || c.role === "searchbox";
}
