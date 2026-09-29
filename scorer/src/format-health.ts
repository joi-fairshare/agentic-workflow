import type { LineOutcome } from "./transcript/parse-line.js";
import type { ProviderName } from "./transcript/source.js";
import { PROVIDER_HAS_USAGE } from "./transcript/source.js";

export interface FormatHealth {
  files: number;
  readErrors: string[];
  lines: number;
  jsonErrors: number;
  assistantLines: number;
  assistantWithoutUsage: number;
  unknownTypes: Record<string, number>;
  byAgentType: Record<string, { assistantLines: number; assistantWithoutUsage: number }>;
  // Lines from providers whose transcripts record token usage — the only ones
  // the "no assistant line in a large read" drift check can judge.
  usageSourceLines: number;
  byProvider: Partial<Record<ProviderName, { files: number; lines: number }>>;
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
  // Codex rollouts (codex.ts prefixes every line type with "codex:").
  "codex:session_meta", "codex:turn_context", "codex:response_item", "codex:event_msg", "codex:token_count",
  "codex:token_usage_record", "codex:world_state", "codex:inter_agent_communication_metadata", "codex:compacted",
  "codex:realtime_item",
  // Cursor agent transcripts (cursor.ts prefixes the role / type with "cursor:").
  "cursor:user", "cursor:assistant", "cursor:turn_ended",
]);

// Line types that are one model call each and so must carry a usage record.
// Codex puts usage on its own event (event_msg/token_count), not on the reply.
const USAGE_LINE_TYPES: ReadonlySet<string> = new Set(["assistant", "codex:token_count"]);

const LARGE_READ = 200;
const MAX_MISSING_USAGE = 0.05;

export function newHealth(): FormatHealth {
  return { files: 0, readErrors: [], lines: 0, jsonErrors: 0, assistantLines: 0, assistantWithoutUsage: 0, unknownTypes: {}, byAgentType: {}, usageSourceLines: 0, byProvider: {} };
}

function providerBucket(h: FormatHealth, provider: ProviderName): { files: number; lines: number } {
  const bucket = h.byProvider[provider] ?? { files: 0, lines: 0 };
  h.byProvider[provider] = bucket;
  return bucket;
}

export function recordFile(h: FormatHealth, provider: ProviderName): void {
  h.files++;
  providerBucket(h, provider).files++;
}

// `provider` omitted means a Claude transcript (the pre-multi-provider call shape).
export function recordHealth(h: FormatHealth, o: LineOutcome, agentType?: string, provider: ProviderName = "claude"): void {
  h.lines++;
  providerBucket(h, provider).lines++;
  if (PROVIDER_HAS_USAGE[provider]) h.usageSourceLines++;
  if (o.jsonError) h.jsonErrors++;
  const isUsageLine = o.lineType !== null && USAGE_LINE_TYPES.has(o.lineType);
  if (isUsageLine) h.assistantLines++;
  if (o.assistantWithoutUsage) h.assistantWithoutUsage++;
  if (o.lineType !== null && !KNOWN_LINE_TYPES.has(o.lineType)) h.unknownTypes[o.lineType] = (h.unknownTypes[o.lineType] ?? 0) + 1;
  if (agentType !== undefined && isUsageLine) {
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
  if (h.assistantLines === 0 && h.usageSourceLines >= LARGE_READ) fatal.push(`${h.usageSourceLines} lines read but none was an assistant line`);
  const unknownCount = Object.values(h.unknownTypes).reduce((a, b) => a + b, 0);
  if (unknownCount / h.lines > 0.5) fatal.push(`${unknownCount} of ${h.lines} lines had unrecognized types`);

  const notices: string[] = [];
  for (const [provider, b] of Object.entries(h.byProvider) as Array<[ProviderName, { files: number; lines: number }]>) {
    if (!PROVIDER_HAS_USAGE[provider] && b.lines > 0) notices.push(`${provider}: ${b.lines} lines read — its transcripts carry no token usage, so it counts toward involvement only, not cost`);
  }
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
