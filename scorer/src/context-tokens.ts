import fs from "node:fs";
import path from "node:path";

import { providerForPath, SOURCES } from "./transcript/sources.js";

// The context size of the most recent model call in a transcript, or null when
// there is none (missing/empty file, or a provider without usage data — Cursor).
export function estimateCurrentContextTokens(filePath: string): number | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  if (raw.length === 0) return null;

  const provider = providerForPath(filePath);
  const parser = SOURCES[provider].createParser({
    provider, path: filePath, project: "", sessionId: path.basename(filePath, ".jsonl"), agentId: "main", agentType: "main", isMain: true,
  });
  let lastTotal: number | null = null;
  let offset = 0;
  for (const line of raw.split("\n")) {
    const at = offset;
    offset += Buffer.byteLength(line, "utf8") + 1;
    if (line.length === 0) continue;
    const outcome = parser.parse(line, at);
    for (const record of outcome.records) {
      if (record.t === "call") lastTotal = record.input + record.cacheRead + record.cacheCreation;
    }
  }
  return lastTotal;
}
