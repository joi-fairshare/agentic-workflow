import type { LineOutcome } from "./transcript/parse-line.js";

export interface FormatHealth {
  files: number;
  readErrors: string[];
  lines: number;
  jsonErrors: number;
  assistantLines: number;
  assistantWithoutUsage: number;
  unknownTypes: Record<string, number>;
  byAgentType: Record<string, { assistantLines: number; assistantWithoutUsage: number }>;
}

export type HealthStatus = "ok" | "no-new-data" | "unknown-format";

export interface Verdict {
  status: HealthStatus;
  problems: string[];
  notices: string[];
}

export const KNOWN_LINE_TYPES: ReadonlySet<string> = new Set([
  "assistant", "user", "attachment", "system", "pr-link", "permission-mode", "mode", "atis-latch",
  "last-prompt", "ai-title", "custom-title", "queue-operation", "summary", "file-history-snapshot",
  "cost-state", "file-history-delta", "fork-context-ref", "bridge-session", "agent-name", "frame-link",
  "artifact-comment-monitor", "artifact-autoreact-ledger", "continued-in", "relocated", "worktree-state",
]);

const LARGE_READ = 200;
const MAX_MISSING_USAGE = 0.05;

export function newHealth(): FormatHealth {
  return { files: 0, readErrors: [], lines: 0, jsonErrors: 0, assistantLines: 0, assistantWithoutUsage: 0, unknownTypes: {}, byAgentType: {} };
}

export function recordHealth(h: FormatHealth, o: LineOutcome, agentType?: string): void {
  h.lines++;
  if (o.jsonError) h.jsonErrors++;
  if (o.lineType === "assistant") h.assistantLines++;
  if (o.assistantWithoutUsage) h.assistantWithoutUsage++;
  if (o.lineType !== null && !KNOWN_LINE_TYPES.has(o.lineType)) h.unknownTypes[o.lineType] = (h.unknownTypes[o.lineType] ?? 0) + 1;
  if (agentType !== undefined && o.lineType === "assistant") {
    const bucket = h.byAgentType[agentType] ?? { assistantLines: 0, assistantWithoutUsage: 0 };
    bucket.assistantLines++;
    if (o.assistantWithoutUsage) bucket.assistantWithoutUsage++;
    h.byAgentType[agentType] = bucket;
  }
}

export function verdict(h: FormatHealth): Verdict {
  if (h.lines === 0) return { status: "no-new-data", problems: [...h.readErrors], notices: [] };
  const fatal: string[] = [];
  if (h.assistantLines > 0 && h.assistantWithoutUsage / h.assistantLines > MAX_MISSING_USAGE) {
    fatal.push(`${h.assistantWithoutUsage} of ${h.assistantLines} assistant lines had no usage record`);
  }
  if (h.assistantLines === 0 && h.lines >= LARGE_READ) fatal.push(`${h.lines} lines read but none was an assistant line`);
  const unknownCount = Object.values(h.unknownTypes).reduce((a, b) => a + b, 0);
  if (unknownCount / h.lines > 0.5) fatal.push(`${unknownCount} of ${h.lines} lines had unrecognized types`);

  const notices: string[] = [];
  for (const [agentType, b] of Object.entries(h.byAgentType)) {
    if (b.assistantLines === 0 || b.assistantWithoutUsage === 0) continue;
    const message = `${agentType}: ${b.assistantWithoutUsage} of ${b.assistantLines} assistant lines had no usage record`;
    if (b.assistantLines >= 20 && b.assistantWithoutUsage / b.assistantLines > MAX_MISSING_USAGE) {
      fatal.push(message);
    } else if (b.assistantLines < 20) {
      notices.push(message);
    }
  }

  const problems = [...fatal];
  if (h.jsonErrors > 0) problems.push(`${h.jsonErrors} lines were not valid JSON`);
  problems.push(...h.readErrors);
  const unknown = Object.entries(h.unknownTypes).map(([t, n]) => `${t}×${n}`);
  if (unknown.length > 0 && fatal.length === 0) notices.push(`unrecognized line types: ${unknown.join(", ")}`);
  return { status: fatal.length > 0 ? "unknown-format" : "ok", problems, notices };
}
