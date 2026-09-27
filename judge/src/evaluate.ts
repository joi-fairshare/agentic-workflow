import crypto from "node:crypto";

import { recordDecision, recordFailure, type Db, type DecisionOutcome, type SkippedProvider } from "./db.js";
import type { JudgeConfig } from "./config.js";
import { providersFor, DEFAULT_CHAIN, type ChainSpec } from "./chain.js";
import { toRef, type QuestionModule } from "./question.js";
import type { Decision, Provider } from "./types.js";

export interface EvaluateDeps {
  db: Db;
  config: JudgeConfig;
  providers: readonly Provider[];
  chain?: ChainSpec;
  now?: () => Date;
  randomId?: () => string;
}

export type EvaluateOutcome<O extends string> = Decision<O> | { escalate: true; reason_code: string };

function recordFailureSafe(db: Db, question: string, provider: Provider["name"], reasonCode: string): void {
  try {
    recordFailure(db, { ts: new Date().toISOString(), question, provider, reason_code: reasonCode });
  } catch {
    /* storage itself is down; nothing more to do, caller already fails open */
  }
}

// A real provider failure or timeout was attempted and didn't pan out — this
// is not a benign "nothing to decide" escalation (a disabled question, an
// input that failed validation, or every candidate merely unavailable/below
// threshold), it's the case `judge health` must surface loudly.
function hadRealFailure(skipped: readonly SkippedProvider[]): boolean {
  return skipped.some((s) => s.reason === "failed" || s.reason === "timeout");
}

export async function evaluate<I, O extends string>(
  question: QuestionModule<I, O>,
  rawInput: unknown,
  deps: EvaluateDeps,
): Promise<EvaluateOutcome<O>> {
  const id = deps.randomId?.() ?? crypto.randomUUID();
  const ts = (deps.now?.() ?? new Date()).toISOString();

  const recordRow = (
    outcome: DecisionOutcome, reasonCode: string, provider: Provider["name"] | "none", decision: O | null,
    confidence: number, latencyMs: number, chainPosition: number, skipped: SkippedProvider[], digestInput: unknown,
  ): void => {
    try {
      recordDecision(deps.db, {
        id, ts, question: question.name, content_class: question.contentClass, provider,
        decision, confidence, reason_code: reasonCode, latency_ms: latencyMs,
        input_digest: crypto.createHash("sha256").update(JSON.stringify(digestInput)).digest("hex").slice(0, 16),
        undone_at: null, chain_position: chainPosition, skipped, outcome,
      });
    } catch {
      // Storage fails open: the outcome still stands, and the miss itself is
      // a judge failure a healthy system should surface (spec: Visibility).
      try {
        recordFailure(deps.db, { ts, question: question.name, provider, reason_code: "decision-write-failed" });
      } catch {
        /* nothing left to fall back to; the outcome is still returned below */
      }
    }
  };

  const escalate = (reasonCode: string, outcome: "escalated" | "failed", skipped: SkippedProvider[] = []): { escalate: true; reason_code: string } => {
    recordRow(outcome, reasonCode, "none", null, 0, 0, skipped.length, skipped, rawInput);
    return { escalate: true, reason_code: reasonCode };
  };

  const qConfig = deps.config.questions[question.name];
  if (qConfig !== undefined && !qConfig.enabled) return escalate("question-disabled", "escalated");
  const threshold = qConfig?.threshold ?? question.threshold;

  const parsed = question.inputSchema.safeParse(rawInput);
  if (!parsed.success) return escalate("invalid-input", "escalated");
  const input = parsed.data;

  const settle = (
    decision: O, confidence: number, model: Provider["name"], reasonCode: string,
    latencyMs: number, chainPosition: number, skipped: SkippedProvider[], extra?: Record<string, unknown>,
  ): Decision<O> => {
    recordRow("decided", reasonCode, model, decision, confidence, latencyMs, chainPosition, skipped, input);
    return extra === undefined ? { decision, confidence, model, reason_code: reasonCode, id } : { decision, confidence, model, reason_code: reasonCode, id, extra };
  };

  const preRuleResult = question.preRules?.(input) ?? null;
  if (preRuleResult !== null) return settle(preRuleResult, 1, "rules", "pre-rule", 0, 0, []);

  const chain = deps.chain ?? DEFAULT_CHAIN;
  const candidates = providersFor(chain, question.contentClass, deps.providers);
  const ref = toRef(question, input);

  const skipped: SkippedProvider[] = [];
  let lastReason: "no-provider-decided" | "below-threshold" = "no-provider-decided";

  for (let i = 0; i < candidates.length; i++) {
    const provider = candidates[i];
    const start = Date.now();
    let result;
    try {
      result = await provider.decide<O>(ref, input, question.timeBudgetMs);
    } catch {
      recordFailureSafe(deps.db, question.name, provider.name, "provider-threw");
      skipped.push({ provider: provider.name, reason: "failed" });
      continue;
    }
    const latencyMs = Date.now() - start;
    if (result.status === "unavailable") {
      const isTimeout = result.reason_code === "timeout";
      // A real timeout is a loud failure (judge health must count it), unlike
      // a benign "no API key configured yet" — that stays uncounted (RF-2).
      if (isTimeout) recordFailureSafe(deps.db, question.name, provider.name, "timeout");
      skipped.push({ provider: provider.name, reason: isTimeout ? "timeout" : "unavailable" });
      continue;
    }
    if (result.status === "error") {
      recordFailureSafe(deps.db, question.name, provider.name, result.reason_code);
      skipped.push({ provider: provider.name, reason: "failed" });
      continue;
    }
    if (!question.outputs.includes(result.decision)) {
      recordFailureSafe(deps.db, question.name, provider.name, "out-of-enum");
      skipped.push({ provider: provider.name, reason: "failed" });
      continue;
    }
    if (result.confidence < threshold) {
      recordFailureSafe(deps.db, question.name, provider.name, "below-threshold-provider");
      skipped.push({ provider: provider.name, reason: "below_threshold" });
      lastReason = "below-threshold";
      continue;
    }
    return settle(result.decision, result.confidence, provider.name, result.reason_code, latencyMs, i, skipped, result.extra);
  }

  return escalate(lastReason, hadRealFailure(skipped) ? "failed" : "escalated", skipped);
}
