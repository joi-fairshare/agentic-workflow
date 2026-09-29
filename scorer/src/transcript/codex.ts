import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import type { LineOutcome, ParsedRecord } from "./parse-line.js";
import type { LineParser, TranscriptFile, TranscriptSource } from "./source.js";
import { eventFromUserText } from "./parse-line.js";
import { projectFromCwd, readFirstLine, stripLeadingTagBlocks } from "./source.js";

// Codex CLI / Desktop rollouts: ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<thread-uuid>.jsonl.
// Every line is { timestamp, type, payload }. The first line is always
// session_meta; a spawned subagent gets its own rollout file whose
// session_meta.source is { subagent: { thread_spawn: {...} } } (or
// { subagent: { other: "guardian" } } for the approvals reviewer).
// Schema learned from real rollouts on 2026-09-28 (codex 0.158).

const ROLLOUT = /^rollout-.+\.jsonl$/;
const UUID_TAIL = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/;
export const MAIN_AGENT_PATH = "/root";
const AGENTS_MD = "# AGENTS.md instructions";

const SessionMetaSchema = z.object({
  type: z.literal("session_meta"),
  payload: z.object({
    id: z.string(),
    session_id: z.string().optional(),
    cwd: z.string().optional(),
    source: z.unknown().optional(),
  }),
});
const SubagentSourceSchema = z.object({
  subagent: z.object({
    thread_spawn: z.object({
      parent_thread_id: z.string().optional(),
      agent_path: z.string().optional(),
      agent_role: z.string().nullable().optional(),
    }).optional(),
    other: z.string().optional(),
  }),
});

const ImportsSchema = z.object({ records: z.array(z.object({ imported_thread_id: z.string() }).passthrough()) });

// Thread ids Codex created by importing Claude Code sessions. The ledger lives
// in the Codex home, the sessions dir's parent.
export function importedThreadIds(sessionsDir: string): Set<string> {
  try {
    const parsed = ImportsSchema.safeParse(JSON.parse(fs.readFileSync(path.join(path.dirname(sessionsDir), "external_agent_session_imports.json"), "utf8")));
    return new Set(parsed.success ? parsed.data.records.map((r) => r.imported_thread_id) : []);
  } catch {
    return new Set();
  }
}

export function discoverCodexFiles(sessionsDir: string): TranscriptFile[] {
  const imported = importedThreadIds(sessionsDir);
  return rollouts(sessionsDir).map((p) => {
    const file = describeRollout(p);
    return imported.has(file.agentId === "main" ? file.sessionId : file.agentId) ? { ...file, imported: true } : file;
  });
}

function rollouts(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return rollouts(p);
    return e.isFile() && ROLLOUT.test(e.name) ? [p] : [];
  });
}

function describeRollout(filePath: string): TranscriptFile {
  const fromName = UUID_TAIL.exec(filePath)?.[1] ?? path.basename(filePath, ".jsonl");
  const fallback: TranscriptFile = { provider: "codex", path: filePath, project: "unknown", sessionId: fromName, agentId: "main", agentType: "main", isMain: true, agentPath: MAIN_AGENT_PATH };
  let meta: z.infer<typeof SessionMetaSchema>["payload"];
  try {
    const parsed = SessionMetaSchema.safeParse(JSON.parse(readFirstLine(filePath)));
    if (!parsed.success) return fallback;
    meta = parsed.data.payload;
  } catch {
    return fallback;
  }
  const project = meta.cwd === undefined ? "unknown" : projectFromCwd(meta.cwd);
  const sub = SubagentSourceSchema.safeParse(meta.source);
  if (!sub.success) return { ...fallback, project, sessionId: meta.id };
  const spawn = sub.data.subagent.thread_spawn;
  return {
    provider: "codex",
    path: filePath,
    project,
    // Subagents share the root thread's session so they group like Claude's do.
    sessionId: meta.session_id ?? spawn?.parent_thread_id ?? meta.id,
    agentId: meta.id,
    agentType: spawn !== undefined ? (spawn.agent_role ?? "default") : (sub.data.subagent.other ?? "unknown"),
    isMain: false,
    ...(spawn?.agent_path === undefined ? {} : { agentPath: spawn.agent_path }),
  };
}

const LineSchema = z.object({ type: z.string(), timestamp: z.string(), payload: z.unknown() });
const UsageSchema = z.object({
  input_tokens: z.number(),
  cached_input_tokens: z.number().optional(),
  cache_write_input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  total_tokens: z.number(),
});
const TokenCountSchema = z.object({
  type: z.literal("token_count"),
  info: z.object({ total_token_usage: UsageSchema, last_token_usage: UsageSchema }).nullable(),
});
const PayloadTypeSchema = z.object({ type: z.string() });
const MessageSchema = z.object({
  type: z.literal("message"),
  role: z.string(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});
const AgentMessageSchema = z.object({ type: z.literal("agent_message"), author: z.string(), recipient: z.string() });
const TurnAbortedSchema = z.object({ type: z.literal("turn_aborted"), reason: z.string() });
const TurnContextSchema = z.object({ model: z.string() });

export function createCodexParser(file: TranscriptFile): LineParser {
  // The model is only named on turn_context lines; carry it forward to the
  // token_count lines that follow. A resumed incremental read starts mid-file
  // without one, hence "unknown" (no metric keys on model).
  let model = "unknown";
  // An imported thread's copied history has no turn_context lines; the first
  // one marks the first turn that actually ran in Codex.
  let live = file.imported !== true;
  return {
    parse(raw: string, offset: number): LineOutcome {
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return { lineType: null, jsonError: true, assistantWithoutUsage: false, records: [] };
      }
      const line = LineSchema.safeParse(json);
      if (!line.success) return { lineType: null, jsonError: false, assistantWithoutUsage: false, records: [] };
      const { type, timestamp: ts, payload } = line.data;
      const ptype = PayloadTypeSchema.safeParse(payload);
      const sub = ptype.success ? ptype.data.type : null;
      const base = { jsonError: false, assistantWithoutUsage: false };

      if (type === "turn_context") {
        live = true;
        const ctx = TurnContextSchema.safeParse(payload);
        if (ctx.success) model = ctx.data.model;
        return { ...base, lineType: "codex:turn_context", records: [] };
      }
      if (!live) return { ...base, lineType: `codex:${type}`, records: [] };
      if (type === "event_msg" && sub === "token_count") {
        const tc = TokenCountSchema.safeParse(payload);
        if (!tc.success) return { ...base, lineType: "codex:token_count", assistantWithoutUsage: true, records: [] };
        if (tc.data.info === null) return { ...base, lineType: "codex:token_count", records: [] };
        return { ...base, lineType: "codex:token_count", records: [toCall(tc.data.info.total_token_usage.total_tokens, tc.data.info.last_token_usage, file, ts, model)] };
      }
      if (type === "event_msg" && sub === "turn_aborted") {
        const ab = TurnAbortedSchema.safeParse(payload);
        const interrupted = ab.success && ab.data.reason === "interrupted" && file.isMain;
        return { ...base, lineType: "codex:event_msg", records: interrupted ? [{ t: "event", uuid: `off:${offset}`, sessionId: file.sessionId, ts, kind: "interrupt", detail: null }] : [] };
      }
      if (type === "response_item") return { ...base, lineType: "codex:response_item", records: responseItem(payload, file, ts, offset) };
      return { ...base, lineType: `codex:${type}`, records: [] };
    },
  };
}

type Usage = z.infer<typeof UsageSchema>;

// Codex (OpenAI) usage: input_tokens already includes cached_input_tokens, so the
// uncached remainder is what maps onto the scorer's `input`. The cumulative total
// is the call's identity: Codex sometimes re-emits an identical token_count, and
// keying on it lets the (file, message_id) primary key drop the duplicate.
function toCall(cumulativeTotal: number, last: Usage, file: TranscriptFile, ts: string, model: string): ParsedRecord {
  const cacheRead = last.cached_input_tokens ?? 0;
  const cacheCreation = last.cache_write_input_tokens ?? 0;
  return {
    t: "call",
    messageId: `tc:${cumulativeTotal}`,
    sessionId: file.sessionId,
    ts,
    model,
    input: Math.max(0, last.input_tokens - cacheRead - cacheCreation),
    cacheRead,
    cacheCreation,
    output: last.output_tokens ?? 0,
  };
}

function responseItem(payload: unknown, file: TranscriptFile, ts: string, offset: number): ParsedRecord[] {
  const agentMsg = AgentMessageSchema.safeParse(payload);
  if (agentMsg.success) {
    if (file.agentPath === undefined || agentMsg.data.recipient !== file.agentPath) return [];
    return [{ t: "event", uuid: `off:${offset}`, sessionId: file.sessionId, ts, kind: "wake_text", detail: agentMsg.data.author }];
  }
  const msg = MessageSchema.safeParse(payload);
  // A subagent's "user" turns are its parent's instructions, not a person.
  if (!msg.success || msg.data.role !== "user" || !file.isMain) return [];
  const texts = msg.data.content
    .flatMap((c) => (c.type === "input_text" && c.text !== undefined ? [stripLeadingTagBlocks(c.text)] : []))
    .filter((t) => t !== "" && !t.startsWith(AGENTS_MD));
  if (texts.length === 0) return [];
  const event = eventFromUserText(texts.join("\n"));
  return event === null ? [] : [{ t: "event", uuid: `off:${offset}`, sessionId: file.sessionId, ts, kind: event.kind, detail: event.detail }];
}

export const codexSource: TranscriptSource = {
  provider: "codex",
  stateful: true,
  discover: discoverCodexFiles,
  createParser: createCodexParser,
};
