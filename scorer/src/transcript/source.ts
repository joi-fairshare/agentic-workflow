import fs from "node:fs";

import type { LineOutcome } from "./parse-line.js";

export type ProviderName = "claude" | "codex" | "cursor";

export const PROVIDERS: readonly ProviderName[] = ["claude", "codex", "cursor"];

// Whether a provider's transcripts record per-call token usage. Cursor's agent
// transcripts carry only role + content (no ids, timestamps, model or usage —
// confirmed against real files 2026-09-28), so cost metrics exclude it.
export const PROVIDER_HAS_USAGE: Readonly<Record<ProviderName, boolean>> = { claude: true, codex: true, cursor: false };

export interface TranscriptFile {
  provider: ProviderName;
  path: string;
  project: string;
  sessionId: string;
  agentId: string;
  agentType: string;
  isMain: boolean;
  // Codex only: the agent's path in the multi-agent tree ("/root" for the main
  // thread, "/root/<nickname>" for a spawned subagent) — used to tell which
  // agent_message lines were delivered *to* this agent.
  agentPath?: string;
  // Codex only: the thread was created by Codex's "import from Claude Code"
  // (listed in ~/.codex/external_agent_session_imports.json). Its opening
  // history is a copy of a Claude transcript the claude source already
  // counts, so only turns that ran in Codex afterwards are ingested.
  imported?: boolean;
}

export interface LineParser {
  // `offset` is the line's byte offset in the file — a stable id for records
  // from providers whose lines carry no uuid of their own.
  parse(raw: string, offset: number): LineOutcome;
}

export interface TranscriptSource {
  provider: ProviderName;
  // A stateful parser carries context between lines (Codex's model, Cursor's
  // last timestamp), so an incremental read replays the already-ingested
  // prefix through it first, discarding the records.
  stateful: boolean;
  discover(root: string): TranscriptFile[];
  createParser(file: TranscriptFile): LineParser;
}

export function isProviderName(value: string): value is ProviderName {
  return (PROVIDERS as readonly string[]).includes(value);
}

// Claude's project directory naming: the cwd with every non-alphanumeric
// character replaced by "-" ("/Users/dev/acme.web" → "-Users-dev-acme-web"),
// so projects line up across providers in the report.
export function projectFromCwd(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9-]/g, "-");
}

const CHUNK = 65_536;

// Reads up to the first newline (or EOF / maxBytes) without loading the file.
export function readFirstLine(filePath: string, maxBytes = 8 * 1024 * 1024): string {
  const fd = fs.openSync(filePath, "r");
  try {
    const chunks: Buffer[] = [];
    let total = 0;
    while (total < maxBytes) {
      const buf = Buffer.alloc(CHUNK);
      const n = fs.readSync(fd, buf, 0, CHUNK, total);
      if (n === 0) break;
      const nl = buf.subarray(0, n).indexOf(0x0a);
      if (nl !== -1) {
        chunks.push(buf.subarray(0, nl));
        break;
      }
      chunks.push(buf.subarray(0, n));
      total += n;
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

// Strips leading `<tag …>…</tag>` context blocks that hosts wrap around a
// human prompt (environment_context, ide_opened_file, timestamp, …), leaving
// whatever the person actually typed. A block that is never closed is left alone.
export function stripLeadingTagBlocks(text: string): string {
  let rest = text.trimStart();
  for (;;) {
    const m = /^<([A-Za-z][\w-]*)\b[^>]*>/.exec(rest);
    if (m === null) return rest;
    const close = `</${m[1]}>`;
    const end = rest.indexOf(close, m[0].length);
    if (end === -1) return rest;
    rest = rest.slice(end + close.length).trimStart();
  }
}
