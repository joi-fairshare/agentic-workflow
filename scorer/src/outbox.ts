import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

export interface OutboxState {
  queuedNow: number;
  expiredEver: number;
}

const OutboxItemSchema = z.object({ ts: z.string(), agentType: z.string().nullable(), text: z.string() });

// Mirrors probe/analyze.ts's readProbeDir tolerance (skip a missing dir, skip
// a malformed/empty line, never throw the whole report over one bad line).
// Non-destructive: only ever reads. Must never race send-gate.sh's own
// lock-guarded read/clear of these same files, so no write, truncate, or
// lock acquisition happens here.
function countValidLines(file: string): number {
  if (!fs.existsSync(file)) return 0;
  return fs.readFileSync(file, "utf8").split("\n").filter((line) => {
    if (line.trim() === "") return false;
    try {
      return OutboxItemSchema.safeParse(JSON.parse(line)).success;
    } catch {
      return false;
    }
  }).length;
}

export function readOutboxState(dir: string): OutboxState {
  if (!fs.existsSync(dir)) return { queuedNow: 0, expiredEver: 0 };
  const expiredFile = path.join(dir, "expired.jsonl");
  const queuedNow = fs.readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl") && f !== "expired.jsonl")
    .reduce((sum, f) => sum + countValidLines(path.join(dir, f)), 0);
  return { queuedNow, expiredEver: countValidLines(expiredFile) };
}
