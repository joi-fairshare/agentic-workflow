// mcp-bridge/src/application/services/ingest-transcript.ts
import type { MemoryDbClient } from "../../db/memory-client.js";
import type { SecretFilter } from "../../ingestion/secret-filter.js";
import type { AppResult } from "../result.js";
import { ok } from "../result.js";
import { parseTranscriptLines } from "../../ingestion/transcript-parser.js";

// ── Types ────────────────────────────────────────────────────

export interface IngestTranscriptInput {
  repo: string;
  sessionId: string;
  sessionTitle: string;
  lines: string[];
}

export interface IngestTranscriptResult {
  messages_ingested: number;
  edges_created: number;
  skipped: number;
}

// ── Service ──────────────────────────────────────────────────

export function ingestTranscriptLines(
  mdb: MemoryDbClient,
  filter: SecretFilter,
  input: IngestTranscriptInput,
): AppResult<IngestTranscriptResult> {
  const { repo, sessionId, sessionTitle, lines } = input;

  // Idempotent: skip if session already ingested
  const existingConv = mdb.getNodeBySource("transcript-session", sessionId);
  if (existingConv) return ok({ messages_ingested: 0, edges_created: 0, skipped: lines.length });

  const parsed = parseTranscriptLines(lines);
  const uuidToNodeId = new Map<string, string>();

  const result = mdb.transaction(() => {
    // Create conversation node
    const convNode = mdb.insertNode({
      repo,
      kind: "conversation",
      title: sessionTitle,
      body: `Transcript session: ${sessionId}`,
      meta: JSON.stringify({ session_path: sessionId }),
      source_id: sessionId,
      source_type: "transcript-session",
    });

    let edgesCreated = 0;

    for (const record of parsed.records) {
      // Skip if this message uuid was already ingested (defensive)
      const existingMsg = mdb.getNodeBySource("transcript", record.uuid);
      if (existingMsg) {
        uuidToNodeId.set(record.uuid, existingMsg.id);
        continue;
      }

      const msgNode = mdb.insertNode({
        repo,
        kind: "message",
        title: record.content.slice(0, 120) || `[${record.type}]`,
        body: filter.redact(record.content),
        meta: JSON.stringify({ type: record.type, timestamp: record.timestamp }),
        source_id: record.uuid,
        source_type: "transcript",
        sender: record.type,
      });

      uuidToNodeId.set(record.uuid, msgNode.id);

      // contains edge: conversation → message
      mdb.insertEdge({
        repo,
        from_node: convNode.id,
        to_node: msgNode.id,
        kind: "contains",
        weight: 1.0,
        meta: "{}",
        auto: true,
      });
      edgesCreated++;

      // reply_to edge: child → parent (if parentUuid is known)
      if (record.parentUuid && uuidToNodeId.has(record.parentUuid)) {
        mdb.insertEdge({
          repo,
          from_node: msgNode.id,
          to_node: uuidToNodeId.get(record.parentUuid)!,
          kind: "reply_to",
          weight: 1.0,
          meta: "{}",
          auto: true,
        });
        edgesCreated++;
      }
    }

    return {
      messages_ingested: parsed.records.length,
      edges_created: edgesCreated,
      skipped: parsed.skipped,
    };
  });

  return ok(result);
}
