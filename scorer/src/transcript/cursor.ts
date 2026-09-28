import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import type { LineOutcome, ParsedRecord } from "./parse-line.js";
import type { LineParser, TranscriptFile, TranscriptSource } from "./source.js";
import { eventFromUserText } from "./parse-line.js";
import { stripLeadingTagBlocks } from "./source.js";

// Cursor agent transcripts: ~/.cursor/projects/<project>/agent-transcripts/<id>/<id>.jsonl,
// subagents under <id>/subagents/<sub-id>.jsonl (no meta file, so no agent type).
// Lines are { role: "user"|"assistant", message: { content: [{type, text}|{type:"tool_use",…}] } }
// or { type: "turn_ended", status: "success"|"error"|"aborted" }. There are no
// ids, no per-line timestamps, no model and no token usage (real files,
// 2026-09-28) — so Cursor contributes involvement signals only. Human prompts
// arrive as <user_query>…</user_query>, usually preceded by a
// <timestamp>Thursday, Sep 3, 2026, 4:45 PM (UTC-7)</timestamp> block, which is
// the only clock available (minute precision); lines before the first one fall
// back to the file's mtime.

export function discoverCursorFiles(projectsDir: string): TranscriptFile[] {
  return dirs(projectsDir).flatMap((project) => {
    const tDir = path.join(projectsDir, project, "agent-transcripts");
    return dirs(tDir).flatMap((id) => {
      const out: TranscriptFile[] = [];
      const main = path.join(tDir, id, `${id}.jsonl`);
      if (fs.existsSync(main)) out.push({ provider: "cursor", path: main, project, sessionId: id, agentId: "main", agentType: "main", isMain: true });
      const subDir = path.join(tDir, id, "subagents");
      for (const name of fs.existsSync(subDir) ? fs.readdirSync(subDir) : []) {
        if (!name.endsWith(".jsonl")) continue;
        out.push({ provider: "cursor", path: path.join(subDir, name), project, sessionId: id, agentId: name.slice(0, -".jsonl".length), agentType: "subagent", isMain: false });
      }
      return out;
    });
  });
}

function dirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const CURSOR_TS = /^(?:[A-Za-z]+,\s*)?([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*\(UTC(?:([+-])(\d{1,2})(?::?(\d{2}))?)?\)$/i;

// "Thursday, Sep 3, 2026, 4:45 PM (UTC-7)" → "2026-09-03T23:45:00.000Z"; null if unrecognized.
export function parseCursorTimestamp(text: string): string | null {
  const m = CURSOR_TS.exec(text.trim());
  if (m === null) return null;
  const month = MONTHS.indexOf(m[1]!.toLowerCase());
  if (month === -1) return null;
  const hour = (Number(m[4]) % 12) + (m[6]!.toUpperCase() === "PM" ? 12 : 0);
  const offsetMin = m[7] === undefined ? 0 : (m[7] === "-" ? -1 : 1) * (Number(m[8]) * 60 + Number(m[9] ?? 0));
  return new Date(Date.UTC(Number(m[3]), month, Number(m[2]), hour, Number(m[5])) - offsetMin * 60_000).toISOString();
}

const LineSchema = z.object({ role: z.string().optional(), type: z.string().optional() });
const UserLineSchema = z.object({
  role: z.literal("user"),
  message: z.object({ content: z.union([z.string(), z.array(z.object({ type: z.string(), text: z.string().optional() }))]) }),
});
const TurnEndedSchema = z.object({ type: z.literal("turn_ended"), status: z.string() });
const TIMESTAMP = /<timestamp>([\s\S]*?)<\/timestamp>/;
const USER_QUERY = /<user_query>([\s\S]*?)<\/user_query>/g;

export function createCursorParser(file: TranscriptFile): LineParser {
  let lastTs: string | null = null;
  let mtime: string | null = null;
  const now = (): string => {
    if (lastTs !== null) return lastTs;
    mtime ??= fs.statSync(file.path).mtime.toISOString();
    return mtime;
  };
  return {
    parse(raw: string, offset: number): LineOutcome {
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return { lineType: null, jsonError: true, assistantWithoutUsage: false, records: [] };
      }
      const line = LineSchema.safeParse(json);
      const kind = line.success ? (line.data.type ?? line.data.role) : undefined;
      const base = { lineType: kind === undefined ? null : `cursor:${kind}`, jsonError: false, assistantWithoutUsage: false };
      const user = UserLineSchema.safeParse(json);
      if (user.success) {
        const texts = typeof user.data.message.content === "string"
          ? [user.data.message.content]
          : user.data.message.content.flatMap((b) => (b.type === "text" && b.text !== undefined ? [b.text] : []));
        const joined = texts.join("\n");
        const stamped = TIMESTAMP.exec(joined);
        const parsedTs = stamped === null ? null : parseCursorTimestamp(stamped[1]!);
        if (parsedTs !== null) lastTs = parsedTs;
        return { ...base, records: file.isMain ? userEvent(joined, file, now(), offset) : [] };
      }
      const ended = TurnEndedSchema.safeParse(json);
      if (ended.success && ended.data.status === "aborted" && file.isMain) {
        return { ...base, records: [{ t: "event", uuid: `off:${offset}`, sessionId: file.sessionId, ts: now(), kind: "interrupt", detail: null }] };
      }
      return { ...base, records: [] };
    },
  };
}

function userEvent(text: string, file: TranscriptFile, ts: string, offset: number): ParsedRecord[] {
  const queries = [...text.matchAll(USER_QUERY)].map((m) => m[1]!);
  const body = (queries.length > 0 ? queries : [text]).map(stripLeadingTagBlocks).filter((t) => t !== "").join("\n");
  if (body === "") return [];
  const event = eventFromUserText(body);
  return event === null ? [] : [{ t: "event", uuid: `off:${offset}`, sessionId: file.sessionId, ts, kind: event.kind, detail: event.detail }];
}

export const cursorSource: TranscriptSource = {
  provider: "cursor",
  stateful: true,
  discover: discoverCursorFiles,
  createParser: createCursorParser,
};
