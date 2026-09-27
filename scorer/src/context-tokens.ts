import fs from "node:fs";

import { parseLine } from "./transcript/parse-line.js";

export function estimateCurrentContextTokens(filePath: string): number | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  if (raw.length === 0) return null;

  let lastTotal: number | null = null;
  for (const line of raw.split("\n")) {
    if (line.length === 0) continue;
    const outcome = parseLine(line);
    for (const record of outcome.records) {
      if (record.t === "call") lastTotal = record.input + record.cacheRead + record.cacheCreation;
    }
  }
  return lastTotal;
}
