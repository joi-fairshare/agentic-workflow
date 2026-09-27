import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

export interface ContextGuardFire {
  ts: string;
  agentId: string | null;
  tokens: number;
}

const FireLineSchema = z.object({ ts: z.string(), agentId: z.string().nullable(), tokens: z.number() });

// Mirrors probe/analyze.ts's readProbeDir shape (JSONL, tolerate unparseable
// lines, empty when the source is missing) — but this reads one fixed file
// (fires.jsonl), not a directory of per-session files, since context-guard.sh
// appends every session's fires to the same shared log.
export function readFiresLog(dir: string): ContextGuardFire[] {
  const file = path.join(dir, "fires.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").flatMap((line) => {
    if (line.length === 0) return [];
    try {
      const parsed = FireLineSchema.safeParse(JSON.parse(line));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
}
