import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let seq = 0;
const nextUuid = (): string => `uuid-${++seq}`;

export function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "scorer-"));
}

export interface AssistantOpts {
  id: string;
  ts: string;
  session?: string;
  uuid?: string;
  model?: string;
  input?: number;
  cacheRead?: number;
  cacheCreation?: number;
  output?: number;
  content?: unknown[];
  sidechain?: boolean;
}

export function assistant(o: AssistantOpts): string {
  return JSON.stringify({
    type: "assistant",
    uuid: o.uuid ?? nextUuid(),
    parentUuid: null,
    sessionId: o.session ?? "s1",
    isSidechain: o.sidechain ?? false,
    timestamp: o.ts,
    message: {
      id: o.id,
      model: o.model ?? "claude-opus-5-5",
      role: "assistant",
      content: o.content ?? [{ type: "text", text: "ok" }],
      usage: {
        input_tokens: o.input ?? 1,
        cache_read_input_tokens: o.cacheRead ?? 0,
        cache_creation_input_tokens: o.cacheCreation ?? 0,
        output_tokens: o.output ?? 1,
      },
    },
  });
}

export interface UserOpts {
  ts: string;
  uuid?: string;
  session?: string;
  sidechain?: boolean;
  meta?: boolean;
}

export function user(content: string | unknown[], o: UserOpts): string {
  return JSON.stringify({
    type: "user",
    uuid: o.uuid ?? nextUuid(),
    sessionId: o.session ?? "s1",
    isSidechain: o.sidechain ?? false,
    ...(o.meta === undefined ? {} : { isMeta: o.meta }),
    timestamp: o.ts,
    message: { role: "user", content },
  });
}

export interface PrLinkOpts {
  number: number;
  ts: string;
  session?: string;
  repo?: string;
}

export function prLink(o: PrLinkOpts): string {
  const repo = o.repo ?? "acme/web-app";
  return JSON.stringify({
    type: "pr-link",
    sessionId: o.session ?? "s1",
    prNumber: o.number,
    prUrl: `https://github.com/${repo}/pull/${o.number}`,
    prRepository: repo,
    timestamp: o.ts,
  });
}

export interface HookCtxOpts {
  ts: string;
  uuid?: string;
  session?: string;
  chars?: number[];
  hookEvent?: string;
}

export function hookCtx(o: HookCtxOpts): string {
  const chars = o.chars ?? [10];
  return JSON.stringify({
    type: "attachment",
    uuid: o.uuid ?? nextUuid(),
    sessionId: o.session ?? "s1",
    timestamp: o.ts,
    attachment: {
      type: "hook_additional_context",
      content: chars.map((n) => "x".repeat(n)),
      hookName: o.hookEvent ?? "SessionStart",
      hookEvent: o.hookEvent ?? "SessionStart",
    },
  });
}

export interface SkillListingOpts {
  ts: string;
  uuid?: string;
  session?: string;
  chars?: number;
  isInitial?: boolean;
}

export function skillListing(o: SkillListingOpts): string {
  return JSON.stringify({
    type: "attachment",
    uuid: o.uuid ?? nextUuid(),
    sessionId: o.session ?? "s1",
    timestamp: o.ts,
    attachment: { type: "skill_listing", content: "x".repeat(o.chars ?? 30000), skillCount: 150, isInitial: o.isInitial ?? true, names: [] },
  });
}

export function writeLines(file: string, lines: string[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.map((l) => `${l}\n`).join(""));
}

export function appendRaw(file: string, text: string): void {
  fs.appendFileSync(file, text);
}
