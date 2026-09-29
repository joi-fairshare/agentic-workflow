import { z } from "zod";

import type { UserTextKind } from "./classify.js";
import { classifyUserText } from "./classify.js";

export type EventKind =
  | "user_prompt"
  | "user_continue"
  | "user_correction"
  | "interrupt"
  | "wake_idle"
  | "wake_text"
  | "wake_terminate";

export type ParsedRecord =
  | { t: "call"; messageId: string; sessionId: string; ts: string; model: string; input: number; cacheRead: number; cacheCreation: number; output: number }
  | { t: "event"; uuid: string; sessionId: string; ts: string; kind: EventKind; detail: string | null }
  | { t: "pr"; sessionId: string; ts: string; repo: string; number: number }
  | { t: "startup_ctx"; uuid: string; sessionId: string; ts: string; category: "skill_listing" | "instructions" | "mcp_instructions" | "hook_context" | "deferred_tools"; source: string; chars: number };

export interface LineOutcome {
  lineType: string | null;
  jsonError: boolean;
  assistantWithoutUsage: boolean;
  records: ParsedRecord[];
}

const INTERRUPT = "[Request interrupted by user";

const BlockSchema = z.object({ type: z.string() }).passthrough();
const UsageSchema = z.object({
  input_tokens: z.number(),
  cache_read_input_tokens: z.number().optional(),
  cache_creation_input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
});
const AssistantLineSchema = z.object({
  sessionId: z.string(),
  timestamp: z.string(),
  message: z.object({ id: z.string(), model: z.string(), usage: UsageSchema }),
});
const UserLineSchema = z.object({
  uuid: z.string(),
  sessionId: z.string(),
  timestamp: z.string(),
  isSidechain: z.boolean().optional(),
  isMeta: z.boolean().optional(),
  message: z.object({ content: z.union([z.string(), z.array(BlockSchema)]) }),
});
const PrLinkLineSchema = z.object({
  sessionId: z.string(),
  timestamp: z.string(),
  prNumber: z.number().int(),
  prRepository: z.string(),
});
const SyntheticSchema = z.object({ message: z.object({ model: z.literal("<synthetic>") }) });
const HookAdditionalContextAttachmentSchema = z.object({
  type: z.literal("hook_additional_context"),
  content: z.union([z.string(), z.array(z.string())]),
  hookEvent: z.string(),
});
const AttachmentLineSchema = z.object({
  uuid: z.string(),
  sessionId: z.string(),
  timestamp: z.string(),
  attachment: z.object({ type: z.string() }).passthrough(),
});
const SkillListingAttachmentSchema = z.object({ type: z.literal("skill_listing"), content: z.string(), isInitial: z.boolean() });
const InstructionsAttachmentSchema = z.object({ type: z.literal("instructions"), files: z.array(z.object({ path: z.string(), content: z.string() })) });
const McpInstructionsDeltaAttachmentSchema = z.object({ type: z.literal("mcp_instructions_delta"), addedNames: z.array(z.string()), addedBlocks: z.array(z.string()) });
const DeferredToolsDeltaAttachmentSchema = z.object({ type: z.literal("deferred_tools_delta"), addedNames: z.array(z.string()), addedLines: z.array(z.string()) });

// A deferred tool's name is "mcp__<server>__<tool>" (the server itself may contain
// single underscores, e.g. "mcp__claude_ai_Linear__create_issue" — only a literal "__"
// is the delimiter). A name with no "mcp__...__..." shape is a builtin tool.
function deferredToolServer(name: string): string {
  const parts = name.split("__");
  return parts.length >= 3 && parts[0] === "mcp" ? parts[1]! : "builtin";
}

function homeRelative(p: string): string {
  const home = process.env.HOME;
  return home && p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}

export function parseLine(raw: string): LineOutcome {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { lineType: null, jsonError: true, assistantWithoutUsage: false, records: [] };
  }
  const typed = z.object({ type: z.string() }).safeParse(json);
  const lineType = typed.success ? typed.data.type : null;
  const base = { lineType, jsonError: false, assistantWithoutUsage: false };
  if (lineType === "assistant") return { ...base, ...parseAssistant(json) };
  if (lineType === "user") return { ...base, records: parseUser(json) };
  if (lineType === "pr-link") return { ...base, records: parsePrLink(json) };
  if (lineType === "attachment") return { ...base, records: parseAttachment(json) };
  return { ...base, records: [] };
}

function parseAssistant(json: unknown): { assistantWithoutUsage: boolean; records: ParsedRecord[] } {
  if (SyntheticSchema.safeParse(json).success) return { assistantWithoutUsage: false, records: [] };
  const parsed = AssistantLineSchema.safeParse(json);
  if (!parsed.success) return { assistantWithoutUsage: true, records: [] };
  const { sessionId, timestamp, message } = parsed.data;
  return { assistantWithoutUsage: false, records: [{
    t: "call",
    messageId: message.id,
    sessionId,
    ts: timestamp,
    model: message.model,
    input: message.usage.input_tokens,
    cacheRead: message.usage.cache_read_input_tokens ?? 0,
    cacheCreation: message.usage.cache_creation_input_tokens ?? 0,
    output: message.usage.output_tokens ?? 0,
  }] };
}

function parseUser(json: unknown): ParsedRecord[] {
  const parsed = UserLineSchema.safeParse(json);
  if (!parsed.success) return [];
  const { uuid, sessionId, timestamp: ts, isSidechain, isMeta, message } = parsed.data;
  const texts: string[] = [];
  if (typeof message.content === "string") {
    texts.push(message.content);
  } else {
    for (const block of message.content) {
      if (block.type === "text" && typeof block.text === "string") texts.push(block.text);
      // Tool results are machine output; only an interrupt marker inside one counts.
      if (block.type === "tool_result" && blockText(block.content).startsWith(INTERRUPT)) texts.push(INTERRUPT);
    }
  }
  if (isSidechain === true || isMeta === true || texts.length === 0) return [];
  const event = eventFromUserText(texts.join("\n"));
  return event === null ? [] : [{ t: "event", uuid, sessionId, ts, kind: event.kind, detail: event.detail }];
}

function blockText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      const text = z.object({ text: z.string() }).safeParse(c);
      return text.success ? text.data.text : "";
    })
    .join("\n");
}

// Shared by every provider's parser: a human-visible user text → the event it
// counts as (or null for machine-injected text).
export function eventFromUserText(text: string): { kind: EventKind; detail: string | null } | null {
  return toEvent(classifyUserText(text));
}

function toEvent(k: UserTextKind): { kind: EventKind; detail: string | null } | null {
  switch (k.kind) {
    case "machine":
      return null;
    case "interrupt":
      return { kind: "interrupt", detail: null };
    case "teammate":
      return { kind: k.sub === "idle" ? "wake_idle" : k.sub === "terminate" ? "wake_terminate" : "wake_text", detail: k.from };
    case "user":
      return { kind: k.sub === "continue" ? "user_continue" : k.sub === "correction" ? "user_correction" : "user_prompt", detail: null };
  }
}

function parsePrLink(json: unknown): ParsedRecord[] {
  const parsed = PrLinkLineSchema.safeParse(json);
  if (!parsed.success) return [];
  const { sessionId, timestamp, prNumber, prRepository } = parsed.data;
  return [{ t: "pr", sessionId, ts: timestamp, repo: prRepository, number: prNumber }];
}

function parseAttachment(json: unknown): ParsedRecord[] {
  const parsed = AttachmentLineSchema.safeParse(json);
  if (!parsed.success) return [];
  const { uuid, sessionId, timestamp: ts, attachment } = parsed.data;

  const hookAttachment = HookAdditionalContextAttachmentSchema.safeParse(attachment);
  if (hookAttachment.success) {
    const { content, hookEvent } = hookAttachment.data;
    const chars = Array.isArray(content) ? content.reduce((sum, s) => sum + s.length, 0) : content.length;
    return [{ t: "startup_ctx", uuid, sessionId, ts, category: "hook_context", source: hookEvent, chars }];
  }

  const skillListing = SkillListingAttachmentSchema.safeParse(attachment);
  if (skillListing.success) {
    if (!skillListing.data.isInitial) return []; // RF-7: only the startup catalog counts
    return [{ t: "startup_ctx", uuid, sessionId, ts, category: "skill_listing", source: "catalog", chars: skillListing.data.content.length }];
  }

  const instructions = InstructionsAttachmentSchema.safeParse(attachment);
  if (instructions.success) {
    return instructions.data.files.map((f) => ({ t: "startup_ctx" as const, uuid, sessionId, ts, category: "instructions" as const, source: homeRelative(f.path), chars: f.content.length }));
  }

  const mcpDelta = McpInstructionsDeltaAttachmentSchema.safeParse(attachment);
  if (mcpDelta.success) {
    const { addedNames, addedBlocks } = mcpDelta.data;
    if (addedNames.length !== addedBlocks.length) return []; // don't guess at a pairing we can't confirm
    return addedNames.map((name, i) => ({ t: "startup_ctx" as const, uuid, sessionId, ts, category: "mcp_instructions" as const, source: name, chars: addedBlocks[i]!.length }));
  }

  const deferredTools = DeferredToolsDeltaAttachmentSchema.safeParse(attachment);
  if (deferredTools.success) {
    const { addedNames, addedLines } = deferredTools.data;
    if (addedNames.length !== addedLines.length) return []; // don't guess at a pairing we can't confirm
    const bySever = new Map<string, number>();
    for (let i = 0; i < addedNames.length; i++) {
      const server = deferredToolServer(addedNames[i]!);
      bySever.set(server, (bySever.get(server) ?? 0) + addedLines[i]!.length);
    }
    return [...bySever.entries()].map(([source, chars]) => ({ t: "startup_ctx" as const, uuid, sessionId, ts, category: "deferred_tools" as const, source, chars }));
  }

  return []; // every other attachment.type is out of scope
}
