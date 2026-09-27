import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { evaluate, type EvaluateDeps } from "./evaluate.js";
import { DEFAULT_CONFIG, judgeConfigPath, loadConfig, type JudgeConfig } from "./config.js";
import {
  findUnmappedBriefByTeammateName, findUnmappedBriefBySubagentDispatch,
  getBriefByToolUseId, getDecision, mapToolUseIdToAgentId, recordUndo, saveBrief, type Db,
} from "./db.js";
import type { QuestionModule } from "./question.js";
import { askCheck } from "./questions/ask-check.js";
import { briefScope } from "./questions/brief-scope.js";
import { ruleCheck } from "./questions/rule-check.js";
import { wakeGate } from "./questions/wake-gate.js";
import { uiElementRepair } from "./questions/ui-element-repair.js";
import { visualCritique } from "./questions/visual-critique.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const QUESTIONS: Record<string, QuestionModule<any, any>> = {
  "wake-gate": wakeGate,
  "ui-element-repair": uiElementRepair,
  "visual-critique": visualCritique,
  "brief-scope": briefScope,
  "rule-check": ruleCheck,
  "ask-check": askCheck,
};

export interface RunDeps extends Omit<EvaluateDeps, "config"> {
  config: JudgeConfig;
}

const DOWN_STREAK = 5;

export async function runQuestion(name: string, rawInput: unknown, deps: RunDeps): Promise<{ exitCode: number; stdout: string; stderr?: string }> {
  const question = QUESTIONS[name];
  if (question === undefined) return { exitCode: 1, stdout: "", stderr: `unknown question: ${name}` };
  const outcome = await evaluate(question, rawInput, deps);
  if ("escalate" in outcome) return { exitCode: 2, stdout: JSON.stringify(outcome) };
  return { exitCode: 0, stdout: JSON.stringify(outcome) };
}

// Dedicated thin subcommand (review fix #2, BLOCKER): the generic runQuestion
// path only ever prints evaluate()'s typed {decision, confidence, model,
// reason_code, id} envelope, so a chosen candidate's index never left the
// judge CLI. ui-element-repair's whole point is which candidate to click —
// this prints exactly {decision, chosenIndex} (chosenIndex omitted for
// no-good-candidate, including the zero-model pre-rule path), reading the
// raw `extra.chosenIndex` field a provider may attach (types.ts) rather than
// widening evaluate()'s own Decision<O> contract.
export async function runUiElementRepairCli(rawInput: unknown, deps: RunDeps): Promise<{ exitCode: number; stdout: string; stderr?: string }> {
  const outcome = await evaluate(uiElementRepair, rawInput, deps);
  if ("escalate" in outcome) return { exitCode: 0, stdout: JSON.stringify({ decision: "no-good-candidate" }) };
  const chosenIndex = outcome.extra?.chosenIndex;
  return { exitCode: 0, stdout: JSON.stringify(chosenIndex === undefined ? { decision: outcome.decision } : { decision: outcome.decision, chosenIndex }) };
}

// Same pattern as runUiElementRepairCli: RunSummary's visual field wants
// {decision, reasons}, not evaluate()'s generic envelope — reasons rides
// through a provider's `extra`, never widening Decision<O> (Task 5).
export async function runVisualCritiqueCli(rawInput: unknown, deps: RunDeps): Promise<{ exitCode: number; stdout: string; stderr?: string }> {
  const outcome = await evaluate(visualCritique, rawInput, deps);
  if ("escalate" in outcome) return { exitCode: 2, stdout: JSON.stringify({ escalate: true, reason_code: outcome.reason_code }) };
  const reasons = outcome.extra?.reasons ?? [];
  return { exitCode: 0, stdout: JSON.stringify({ decision: outcome.decision, reasons }) };
}

const BriefSaveInputSchema = z.object({
  toolUseId: z.string(), sessionId: z.string(), promptId: z.string(),
  dispatchName: z.string().nullable(), subagentType: z.string(),
  goal: z.string(), acceptanceCriteria: z.string(), proofCommand: z.string(),
});

export function runBriefSave(db: Db, raw: unknown, now: () => Date = () => new Date()): { exitCode: number; stdout: string; stderr?: string } {
  const parsed = BriefSaveInputSchema.safeParse(raw);
  if (!parsed.success) return { exitCode: 1, stdout: "", stderr: "invalid brief payload" };
  saveBrief(db, { ...parsed.data, savedAt: now().toISOString() });
  return { exitCode: 0, stdout: "" };
}

export function runBriefGet(db: Db, toolUseId: string): { exitCode: number; stdout: string; stderr?: string } {
  const row = getBriefByToolUseId(db, toolUseId);
  if (row === undefined) return { exitCode: 1, stdout: "", stderr: `no brief for tool_use_id: ${toolUseId}` };
  return { exitCode: 0, stdout: JSON.stringify(row) };
}

export function runBriefMapByName(db: Db, name: string): { exitCode: number; stdout: string } {
  const row = findUnmappedBriefByTeammateName(db, name);
  return { exitCode: 0, stdout: row === undefined ? "" : row.toolUseId };
}

export function runBriefMapByDispatch(db: Db, sessionId: string, promptId: string, subagentType: string): { exitCode: number; stdout: string } {
  const row = findUnmappedBriefBySubagentDispatch(db, sessionId, promptId, subagentType);
  return { exitCode: 0, stdout: row === undefined ? "" : row.toolUseId };
}

export function runBriefSetAgentId(db: Db, toolUseId: string, agentId: string): { exitCode: number; stdout: string } {
  mapToolUseIdToAgentId(db, toolUseId, agentId);
  return { exitCode: 0, stdout: "" };
}

// Dedicated subcommand (Task 4): the Stop hook's own exit-code contract is
// the inverse of runQuestion's generic one — exit 2 here means "continue"
// (don't actually stop; the caller writes auto_continued_at), exit 0 means
// "ask" (a real stop is fine) or "no decision reached at all" (fail safe to
// asking, never to auto-continuing on an escalation).
export async function runAskCheckCli(rawInput: unknown, deps: RunDeps): Promise<{ exitCode: number; stdout: string; stderr?: string }> {
  const outcome = await evaluate(askCheck, rawInput, deps);
  if ("escalate" in outcome) return { exitCode: 0, stdout: JSON.stringify({ decision: "ask", reason_code: outcome.reason_code }) };
  if (outcome.decision === "continue") return { exitCode: 2, stdout: JSON.stringify(outcome) };
  return { exitCode: 0, stdout: JSON.stringify(outcome) };
}

export function runUndo(db: Db, id: string, now: () => Date): { exitCode: number; stdout: string } {
  const row = getDecision(db, id);
  if (row === undefined) return { exitCode: 1, stdout: `` };
  recordUndo(db, id, now().toISOString());
  return { exitCode: 0, stdout: JSON.stringify(getDecision(db, id)) };
}

export function runWhy(db: Db, id: string): { exitCode: number; stdout: string; stderr?: string } {
  const row = getDecision(db, id);
  if (row === undefined) return { exitCode: 1, stdout: "", stderr: `unknown decision: ${id}` };
  return { exitCode: 0, stdout: JSON.stringify(row) };
}

// Thin marker until Plan 5's done/scope gates add a dedicated approvals table:
// prefixes reason_code with "approved:" so a later reader can tell an escalated
// decision was manually cleared by the user.
export function runApprove(db: Db, id: string): { exitCode: number; stdout: string; stderr?: string } {
  const row = getDecision(db, id);
  if (row === undefined) return { exitCode: 1, stdout: "", stderr: `unknown decision: ${id}` };
  db.prepare("UPDATE decisions SET reason_code = ? WHERE id = ?").run(`approved:${row.reason_code}`, id);
  return { exitCode: 0, stdout: JSON.stringify(getDecision(db, id)) };
}

export function runHealth(db: Db): { exitCode: number; stdout: string } {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const failures24h = (db.prepare("SELECT COUNT(*) as n FROM failures WHERE ts >= ?").get(since) as { n: number }).n;
  // "Model attempts" excludes rows that never reached a provider at all
  // (a disabled question, invalid input) — only decided/failed rows count.
  const lastAttempts = db
    .prepare("SELECT outcome FROM decisions WHERE outcome IN ('decided', 'failed') ORDER BY ts DESC LIMIT ?")
    .all(DOWN_STREAK) as Array<{ outcome: string }>;
  const allRecentAttemptsFailed = lastAttempts.length === DOWN_STREAK && lastAttempts.every((r) => r.outcome === "failed");
  const status = failures24h === 0 ? "ok" : allRecentAttemptsFailed ? "down" : "degraded";
  return { exitCode: 0, stdout: JSON.stringify({ status, failures24h }) };
}

export function runConfigGet(file: string = judgeConfigPath()): { exitCode: number; stdout: string } {
  return { exitCode: 0, stdout: JSON.stringify(loadConfig(file)) };
}

export function runConfigSet(
  question: string,
  field: "enabled" | "threshold",
  rawValue: string,
  file: string = judgeConfigPath(),
): { exitCode: number; stdout: string; stderr?: string } {
  const current = fs.existsSync(file) ? loadConfig(file) : DEFAULT_CONFIG;
  const existing = current.questions[question] ?? { enabled: true, threshold: 0.7 };
  let updated: { enabled: boolean; threshold: number };
  if (field === "enabled") {
    updated = { ...existing, enabled: rawValue === "true" };
  } else {
    const n = Number(rawValue);
    if (!Number.isFinite(n)) return { exitCode: 1, stdout: "", stderr: `not a number: ${rawValue}` };
    updated = { ...existing, threshold: n };
  }
  const next: JudgeConfig = { questions: { ...current.questions, [question]: updated } };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
  return { exitCode: 0, stdout: JSON.stringify(next) };
}
