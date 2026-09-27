import { z } from "zod";
import { describe, expect, it } from "vitest";

import { evaluate } from "../src/evaluate.js";
import type { QuestionModule } from "../src/question.js";
import { openDb, getDecision } from "../src/db.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { DEFAULT_CHAIN } from "../src/chain.js";
import { fakeProvider } from "./helpers.js";

const InputSchema = z.object({ text: z.string() });
type Input = z.infer<typeof InputSchema>;
type Output = "send" | "batch" | "drop";

function question(overrides: Partial<QuestionModule<Input, Output>> = {}): QuestionModule<Input, Output> {
  return {
    name: "wake-gate",
    inputSchema: InputSchema,
    outputs: ["send", "batch", "drop"],
    prompt: (i) => `Classify: ${i.text}`,
    threshold: 0.7,
    contentClass: "message-meta",
    timeBudgetMs: 5000,
    ...overrides,
  };
}

describe("evaluate", () => {
  it("settles on a pre-rule without calling any provider (RF-5)", async () => {
    const db = openDb(":memory:");
    const q = question({ preRules: (i) => (i.text === "{}" ? "drop" : null) });
    const called: string[] = [];
    const provider = fakeProvider("claude-cli", ["message-meta"], () => {
      called.push("claude-cli");
      return { status: "decided", decision: "send", confidence: 1, reason_code: "model" };
    });
    const result = await evaluate(q, { text: "{}" }, { db, config: DEFAULT_CONFIG, providers: [provider] });
    expect(result).toMatchObject({ decision: "drop", model: "rules" });
    expect(called).toEqual([]);
  });

  it("walks the chain in order and uses the first decided result", async () => {
    const db = openDb(":memory:");
    const q = question();
    const jev = fakeProvider<Output>("jev", ["message-meta"], { status: "unavailable", reason_code: "no-key" });
    const cli = fakeProvider<Output>("claude-cli", ["message-meta"], { status: "decided", decision: "batch", confidence: 0.9, reason_code: "model" });
    const result = await evaluate(q, { text: "progress update" }, { db, config: DEFAULT_CONFIG, providers: [jev, cli] });
    expect(result).toMatchObject({ decision: "batch", model: "claude-cli", confidence: 0.9 });
  });

  it("escalates, never guesses, when every provider is unavailable (below threshold)", async () => {
    const db = openDb(":memory:");
    const q = question();
    const jev = fakeProvider<Output>("jev", ["message-meta"], { status: "unavailable", reason_code: "no-key" });
    const cli = fakeProvider<Output>("claude-cli", ["message-meta"], { status: "error", reason_code: "timeout" });
    const result = await evaluate(q, { text: "hmm" }, { db, config: DEFAULT_CONFIG, providers: [jev, cli] });
    expect(result).toEqual({ escalate: true, reason_code: "no-provider-decided" });
  });

  it("escalates when a decided result is below the question's threshold", async () => {
    const db = openDb(":memory:");
    const q = question({ threshold: 0.95 });
    const cli = fakeProvider<Output>("claude-cli", ["message-meta"], { status: "decided", decision: "send", confidence: 0.5, reason_code: "model" });
    const result = await evaluate(q, { text: "hmm" }, { db, config: DEFAULT_CONFIG, providers: [cli] });
    expect(result).toEqual({ escalate: true, reason_code: "below-threshold" });
  });

  it("rejects an out-of-enum decision as a provider error and falls through (RF-3)", async () => {
    const db = openDb(":memory:");
    const q = question();
    const bad = fakeProvider("jev", ["message-meta"], { status: "decided", decision: "yes" as unknown as Output, confidence: 1, reason_code: "model" });
    const good = fakeProvider<Output>("claude-cli", ["message-meta"], { status: "decided", decision: "send", confidence: 1, reason_code: "model" });
    const result = await evaluate(q, { text: "hmm" }, { db, config: DEFAULT_CONFIG, providers: [bad, good], randomId: () => "oo-id" });
    expect(result).toMatchObject({ decision: "send", model: "claude-cli" });
    const failures = db.prepare("SELECT COUNT(*) as n FROM failures WHERE provider = 'jev'").get();
    expect(failures).toEqual({ n: 1 });
    // The winner is chain position 1 (jev was position 0 and was skipped), and
    // the stored row records exactly why jev was passed over (spec: real
    // fallback accounting, not conflated with the failures table).
    expect(getDecision(db, "oo-id")).toMatchObject({
      chain_position: 1,
      skipped: [{ provider: "jev", reason: "failed" }],
    });
  });

  it("records a failure row and fails open when a provider throws (RF-1)", async () => {
    const db = openDb(":memory:");
    const q = question();
    const throwing = fakeProvider<Output>("claude-cli", ["message-meta"], () => {
      throw new Error("child killed");
    });
    const result = await evaluate(q, { text: "hmm" }, { db, config: DEFAULT_CONFIG, providers: [throwing] });
    expect(result).toEqual({ escalate: true, reason_code: "no-provider-decided" });
    const failures = db.prepare("SELECT reason_code FROM failures").all();
    expect(failures).toEqual([{ reason_code: "provider-threw" }]);
  });

  it("skips a disabled question entirely and escalates", async () => {
    const db = openDb(":memory:");
    const q = question();
    const config = { questions: { "wake-gate": { enabled: false, threshold: 0.7 } } };
    const cli = fakeProvider<Output>("claude-cli", ["message-meta"], () => {
      throw new Error("must not be called");
    });
    const result = await evaluate(q, { text: "hmm" }, { db, config, providers: [cli] });
    expect(result).toEqual({ escalate: true, reason_code: "question-disabled" });
  });

  it("rejects input that fails the question's Zod schema before any provider runs", async () => {
    const db = openDb(":memory:");
    const q = question();
    const cli = fakeProvider<Output>("claude-cli", ["message-meta"], () => {
      throw new Error("must not be called");
    });
    const result = await evaluate(q, { text: 5 }, { db, config: DEFAULT_CONFIG, providers: [cli] });
    expect(result).toEqual({ escalate: true, reason_code: "invalid-input" });
  });

  it("records the winning decision in decisions.sqlite with a generated id, chain_position 0, and no skipped entries when the first candidate decides", async () => {
    const db = openDb(":memory:");
    const q = question();
    const cli = fakeProvider<Output>("claude-cli", ["message-meta"], { status: "decided", decision: "send", confidence: 1, reason_code: "model" });
    const result = await evaluate(q, { text: "hmm" }, { db, config: DEFAULT_CONFIG, providers: [cli], now: () => new Date("2026-09-27T00:00:00.000Z"), randomId: () => "fixed-id" });
    expect(result).toMatchObject({ id: "fixed-id" });
    expect(getDecision(db, "fixed-id")).toMatchObject({ decision: "send", provider: "claude-cli", question: "wake-gate", content_class: "message-meta", chain_position: 0, skipped: [] });
  });

  it("records every skipped provider's reason (unavailable, timeout, below_threshold) ahead of the winner", async () => {
    const db = openDb(":memory:");
    const q = question();
    const jev = fakeProvider<Output>("jev", ["message-meta"], { status: "unavailable", reason_code: "no-api-key" });
    const cli = fakeProvider<Output>("claude-cli", ["message-meta"], { status: "decided", decision: "batch", confidence: 0.9, reason_code: "model" });
    const result = await evaluate(q, { text: "hmm" }, { db, config: DEFAULT_CONFIG, providers: [jev, cli], randomId: () => "skip-id" });
    expect(result).toMatchObject({ decision: "batch" });
    expect(getDecision(db, "skip-id")).toMatchObject({
      chain_position: 1,
      skipped: [{ provider: "jev", reason: "unavailable" }],
    });
  });

  it("records a skipped reason of timeout, not unavailable, when the provider's own reason_code is timeout", async () => {
    const db = openDb(":memory:");
    const q = question();
    const jev = fakeProvider<Output>("jev", ["message-meta"], { status: "unavailable", reason_code: "timeout" });
    const cli = fakeProvider<Output>("claude-cli", ["message-meta"], { status: "decided", decision: "send", confidence: 1, reason_code: "model" });
    const result = await evaluate(q, { text: "hmm" }, { db, config: DEFAULT_CONFIG, providers: [jev, cli], randomId: () => "timeout-skip-id" });
    expect(result).toMatchObject({ decision: "send" });
    expect(getDecision(db, "timeout-skip-id")).toMatchObject({ skipped: [{ provider: "jev", reason: "timeout" }] });
  });

  it("a failed failure-row write inside the chain still escalates without throwing", async () => {
    const db = openDb(":memory:");
    db.close(); // any write now throws, including recordFailureSafe's own attempt
    const q = question();
    const erroring = fakeProvider<Output>("claude-cli", ["message-meta"], { status: "error", reason_code: "timeout" });
    const result = await evaluate(q, { text: "hmm" }, { db, config: DEFAULT_CONFIG, providers: [erroring] });
    expect(result).toEqual({ escalate: true, reason_code: "no-provider-decided" });
  });

  it("a failed decision write still returns the decision (fails open, counted as a judge failure)", async () => {
    const db = openDb(":memory:");
    db.close(); // any write now throws
    const q = question();
    const cli = fakeProvider<Output>("claude-cli", ["message-meta"], { status: "decided", decision: "send", confidence: 1, reason_code: "model" });
    const result = await evaluate(q, { text: "hmm" }, { db, config: DEFAULT_CONFIG, providers: [cli] });
    expect(result).toMatchObject({ decision: "send" });
  });

  it("records a decisions row for a disabled question, outcome escalated, decision null, provider none", async () => {
    const db = openDb(":memory:");
    const q = question();
    const config = { questions: { "wake-gate": { enabled: false, threshold: 0.7 } } };
    const result = await evaluate(q, { text: "hmm" }, { db, config, providers: [], randomId: () => "disabled-id" });
    expect(result).toEqual({ escalate: true, reason_code: "question-disabled" });
    expect(getDecision(db, "disabled-id")).toMatchObject({ decision: null, provider: "none", outcome: "escalated", reason_code: "question-disabled" });
  });

  it("records a decisions row for invalid input, outcome escalated, decision null", async () => {
    const db = openDb(":memory:");
    const q = question();
    const result = await evaluate(q, { text: 5 }, { db, config: DEFAULT_CONFIG, providers: [], randomId: () => "invalid-id" });
    expect(result).toEqual({ escalate: true, reason_code: "invalid-input" });
    expect(getDecision(db, "invalid-id")).toMatchObject({ decision: null, provider: "none", outcome: "escalated", reason_code: "invalid-input" });
  });

  it("records outcome escalated (not failed) when nothing decided but no provider actually failed or timed out", async () => {
    const db = openDb(":memory:");
    const q = question();
    const jev = fakeProvider<Output>("jev", ["message-meta"], { status: "unavailable", reason_code: "no-api-key" });
    const result = await evaluate(q, { text: "hmm" }, { db, config: DEFAULT_CONFIG, providers: [jev], randomId: () => "clean-escalate-id" });
    expect(result).toEqual({ escalate: true, reason_code: "no-provider-decided" });
    expect(getDecision(db, "clean-escalate-id")).toMatchObject({ outcome: "escalated", decision: null });
  });

  it("records outcome failed (a real provider failure/timeout occurred) when nothing decided (matches the real-world case: claude-cli timed out)", async () => {
    const db = openDb(":memory:");
    const q = question();
    const jev = fakeProvider<Output>("jev", ["message-meta"], { status: "unavailable", reason_code: "no-api-key" });
    const cli = fakeProvider<Output>("claude-cli", ["message-meta"], { status: "unavailable", reason_code: "timeout" });
    const result = await evaluate(q, { text: "hmm" }, { db, config: DEFAULT_CONFIG, providers: [jev, cli], randomId: () => "real-failure-id" });
    expect(result).toEqual({ escalate: true, reason_code: "no-provider-decided" });
    expect(getDecision(db, "real-failure-id")).toMatchObject({
      outcome: "failed", decision: null,
      skipped: [{ provider: "jev", reason: "unavailable" }, { provider: "claude-cli", reason: "timeout" }],
    });
    // A real timeout is now counted as a judge failure (previously silently
    // dropped) — this is the bug the user hit: `judge health` said 0 failures.
    const failures = db.prepare("SELECT COUNT(*) as n FROM failures WHERE provider = 'claude-cli' AND reason_code = 'timeout'").get();
    expect(failures).toEqual({ n: 1 });
  });

  it("records outcome failed when below-threshold is reached only after a real failure earlier in the chain", async () => {
    const db = openDb(":memory:");
    const q = question({ threshold: 0.95 });
    const cli = fakeProvider<Output>("claude-cli", ["message-meta"], { status: "error", reason_code: "exit-1" });
    const rules = fakeProvider<Output>("rules", ["message-meta"], { status: "decided", decision: "send", confidence: 0.5, reason_code: "rules-fallback" });
    const result = await evaluate(q, { text: "hmm" }, {
      db, config: DEFAULT_CONFIG, providers: [cli, rules], chain: DEFAULT_CHAIN, randomId: () => "mixed-failure-id",
    });
    expect(result).toEqual({ escalate: true, reason_code: "below-threshold" });
    expect(getDecision(db, "mixed-failure-id")).toMatchObject({ outcome: "failed" });
  });

  it("reaches rules at the end of the chain when every model provider fails or is unavailable (plan review BLOCKER: rules was unreachable)", async () => {
    const db = openDb(":memory:");
    const q = question();
    const jev = fakeProvider<Output>("jev", ["message-meta"], { status: "unavailable", reason_code: "no-api-key" });
    const cli = fakeProvider<Output>("claude-cli", ["message-meta"], { status: "error", reason_code: "timeout" });
    const rules = fakeProvider<Output>("rules", ["message-meta"], { status: "decided", decision: "batch", confidence: 1, reason_code: "rules-fallback" });
    const result = await evaluate(q, { text: "hmm" }, {
      db, config: DEFAULT_CONFIG, providers: [jev, cli, rules], chain: DEFAULT_CHAIN, randomId: () => "rules-id",
    });
    expect(result).toMatchObject({ decision: "batch", model: "rules", reason_code: "rules-fallback" });
    expect(getDecision(db, "rules-id")).toMatchObject({
      chain_position: 2,
      skipped: [{ provider: "jev", reason: "unavailable" }, { provider: "claude-cli", reason: "failed" }],
    });
  });
});
