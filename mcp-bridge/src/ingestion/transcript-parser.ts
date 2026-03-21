// mcp-bridge/src/ingestion/transcript-parser.ts
import { z } from "zod";

// ── Zod schema for transcript JSONL lines ────────────────────

const TranscriptLineSchema = z.object({
  type: z.string(),
  uuid: z.string(),
  parentUuid: z.string().nullable().optional(),
  message: z.object({
    content: z.union([z.string(), z.array(z.unknown())]).optional(),
  }).optional(),
  timestamp: z.string().optional(),
}).passthrough();

// ── Types ────────────────────────────────────────────────────

export interface TranscriptRecord {
  type: string;
  uuid: string;
  parentUuid: string | null;
  content: string;
  timestamp: string | null;
  /**
   * Full parsed JSON for debugging. WARNING: This field may contain secrets
   * from the original transcript and MUST NOT be persisted to the database.
   * Always pass through SecretFilter.redact() before any storage or logging.
   */
  raw: Record<string, unknown>;
}

export interface ParseResult {
  records: TranscriptRecord[];
  skipped: number;
}

// ── Parser ───────────────────────────────────────────────────

function extractContent(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const msg = message as Record<string, unknown>;
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item) return String((item as { text: unknown }).text);
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export function parseTranscriptLines(lines: string[]): ParseResult {
  const records: TranscriptRecord[] = [];
  let skipped = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      skipped++;
      continue;
    }

    const result = TranscriptLineSchema.safeParse(parsed);
    if (!result.success) {
      skipped++;
      continue;
    }

    const data = result.data;
    records.push({
      type: data.type,
      uuid: data.uuid,
      parentUuid: data.parentUuid ?? null,
      content: extractContent(data.message),
      timestamp: data.timestamp ?? null,
      raw: data as Record<string, unknown>,
    });
  }

  return { records, skipped };
}
