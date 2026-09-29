import type { ProviderName, TranscriptSource } from "./source.js";
import { codexSource } from "./codex.js";
import { cursorSource } from "./cursor.js";
import { discoverFiles } from "./discover.js";
import { parseLine } from "./parse-line.js";

export const claudeSource: TranscriptSource = {
  provider: "claude",
  stateful: false,
  discover: discoverFiles,
  // Claude lines are self-describing (uuid, sessionId, timestamp on every line).
  createParser: () => ({ parse: (raw) => parseLine(raw) }),
};

export const SOURCES: Readonly<Record<ProviderName, TranscriptSource>> = {
  claude: claudeSource,
  codex: codexSource,
  cursor: cursorSource,
};

// Picks the parser for a transcript path by where it lives — used by
// `scorer context-tokens <path>`, whose caller only has a path.
export function providerForPath(filePath: string): ProviderName {
  if (/[\\/]\.codex[\\/](?:archived_)?sessions[\\/]/.test(filePath)) return "codex";
  if (/[\\/]agent-transcripts[\\/]/.test(filePath)) return "cursor";
  return "claude";
}
