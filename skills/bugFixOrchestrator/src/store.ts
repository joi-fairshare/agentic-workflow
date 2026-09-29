import fs from "node:fs";
import path from "node:path";

import { StateSchema, type State } from "./schema.js";

export const stateFile = (dir: string): string => path.join(dir, "state.json");
export const runsDir = (dir: string): string => path.join(dir, "runs");

export function loadState(dir: string): State | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(stateFile(dir), "utf8"));
  } catch {
    return { error: `no readable state at ${stateFile(dir)} — run bugfix-state init first` };
  }
  const parsed = StateSchema.safeParse(raw);
  if (!parsed.success) return { error: `invalid state file ${stateFile(dir)}: ${parsed.error.issues[0].message}` };
  return parsed.data;
}

// Temp file + rename, so a crash mid-write never leaves a half-written state.
export function saveState(dir: string, state: State): void {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${stateFile(dir)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  fs.renameSync(tmp, stateFile(dir));
}
