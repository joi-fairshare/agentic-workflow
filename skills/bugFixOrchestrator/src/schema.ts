import { z } from "zod";

const nonBlank = (field: string) => z.string().refine((s) => s.trim() !== "", `${field} is empty`);

export const PHASES = ["intake", "investigate", "reproduce", "fix", "evaluate", "report"] as const;
export type Phase = (typeof PHASES)[number];

export const MODES = ["A", "B", "C"] as const;
export type Mode = (typeof MODES)[number];

export const MAX_ATTEMPTS = 3;

export const TicketSchema = z.object({
  source: z.enum(["linear", "text"]),
  id: z.string().nullable(),
  title: z.string(),
  // Verbatim ticket title + description; judge resolution-check reads it as-is.
  brief: nonBlank("brief"),
  expected: nonBlank("expected"),
  actual: z.string(),
});
export type Ticket = z.infer<typeof TicketSchema>;

const JudgeSchema = z.object({
  decisionId: z.string().nullable(),
  decision: z.enum(["resolved", "partial", "unresolved", "escalated"]),
  reasonCode: z.string(),
});

const RunSchema = z.object({ evidence: z.string(), passed: z.boolean(), commit: z.string(), recordedAt: z.string() });

const CandidateSchema = z.object({
  id: z.string(),
  attempt: z.number().int(),
  mode: z.enum(MODES),
  branch: z.string(),
  cwd: z.string(),
  commit: z.string(),
  /** Handoff hypothesis number this candidate pursues (required in mode B). */
  hypothesis: z.number().int().nullable(),
  /** Files changed since the baseline, as recorded at record-candidate. */
  changedFiles: z.array(z.string()),
  /** input_digest judge must report for this candidate's decision (set by judge-input). */
  judgeInputDigest: z.string().nullable(),
  run: RunSchema.nullable(),
  judge: JudgeSchema.nullable(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export const StateSchema = z.object({
  version: z.literal(1),
  ticket: TicketSchema,
  phase: z.enum(PHASES),
  status: z.enum(["active", "resolved", "unresolved", "needs-human"]),
  attempt: z.number().int(),
  attemptMode: z.enum(MODES).nullable(),
  handoff: z.string().nullable(),
  // Snapshot of the handoff taken at advance investigate: later steps use this,
  // never the (mutable) file.
  investigation: z
    .object({
      rootCause: z.string(),
      hypotheses: z.array(z.object({ n: z.number().int(), text: z.string(), files: z.array(z.string()), result: z.enum(["confirmed", "ruled-out", "untested"]) })),
    })
    .nullable(),
  check: z
    .object({
      kind: z.enum(["ui-evidence", "test"]),
      path: z.string(),
      sha256: z.string(),
      // The exact argv of the baseline run-test; every later test run must match it.
      command: z.array(z.string()).nullable(),
    })
    .nullable(),
  baseline: z.object({ evidence: z.string(), commit: z.string() }).nullable(),
  candidates: z.array(CandidateSchema),
  // Every result run-test / run-ui wrote (path + sha256): evidence only counts when registered here.
  runs: z.array(z.object({ evidence: z.string(), sha256: z.string() })),
  resolvedBy: z.string().nullable(),
  history: z.array(
    z.object({ at: z.string(), command: z.string(), from: z.enum(PHASES).nullable(), to: z.enum(PHASES), evidence: z.string().nullable() }),
  ),
});
export type State = z.infer<typeof StateSchema>;

// Written only by `bugfix-state run-test`, never by an agent.
export const TestResultSchema = z.object({
  kind: z.literal("test"),
  command: z.array(z.string()),
  exitCode: z.number().int(),
  commit: z.string(),
  checkSha256: z.string(),
  log: z.string(),
});
export type TestResult = z.infer<typeof TestResultSchema>;

// The subset of ui-evidence's summary.json the gate needs.
export const UiSummarySchema = z.object({
  steps: z.array(z.object({ status: z.enum(["passed", "failed", "broken"]) })),
  appBuild: z.string().nullable().optional(),
  scriptSha256: z.string().nullable().optional(),
});
