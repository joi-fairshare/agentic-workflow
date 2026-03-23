// mcp-bridge/src/application/services/ingest-generic.ts
import type { MemoryDbClient } from "../../db/memory-client.js";
import type { SecretFilter } from "../../ingestion/secret-filter.js";
import type { AppResult } from "../result.js";
import { ok } from "../result.js";

// ── Input types ───────────────────────────────────────────────

export interface GenericChatMessage {
  role: string;
  content: string;
  timestamp?: string;
}

export interface IngestGenericChatInput {
  repo: string;
  sessionId: string;
  sessionTitle: string;
  messages: GenericChatMessage[];
}

// ── Output type ───────────────────────────────────────────────

export interface IngestGenericChatResult {
  messages_ingested: number;
  edges_created: number;
  skipped: number;
  conversation_id: string;
}

// ── Service ───────────────────────────────────────────────────

export function ingestGenericChat(
  mdb: MemoryDbClient,
  filter: SecretFilter,
  input: IngestGenericChatInput,
): AppResult<IngestGenericChatResult> {
  const { repo, sessionId, sessionTitle, messages } = input;

  // Idempotency check — skip if session already ingested
  const existing = mdb.getNodeBySource("generic-session", sessionId);
  if (existing) {
    return ok({
      messages_ingested: 0,
      edges_created: 0,
      skipped: 1,
      conversation_id: existing.id,
    });
  }

  const result = mdb.transaction(() => {
    // Create the conversation node
    const convNode = mdb.insertNode({
      repo,
      kind: "conversation",
      title: filter.redact(sessionTitle),
      body: "",
      meta: JSON.stringify({ session_id: sessionId }),
      source_id: sessionId,
      source_type: "generic-session",
    });

    let messagesIngested = 0;
    let edgesCreated = 0;
    let previousNodeId: string | null = null;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const sourceId = `${sessionId}:msg:${i}`;
      const redactedContent = filter.redact(msg.content);

      const msgNode = mdb.insertNode({
        repo,
        kind: "message",
        title: redactedContent.slice(0, 120),
        body: redactedContent,
        meta: JSON.stringify({ role: msg.role, timestamp: msg.timestamp ?? null }),
        source_id: sourceId,
        source_type: "generic-message",
        sender: msg.role,
      });

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

      // reply_to edge: current message → previous message
      if (previousNodeId !== null) {
        mdb.insertEdge({
          repo,
          from_node: msgNode.id,
          to_node: previousNodeId,
          kind: "reply_to",
          weight: 1.0,
          meta: "{}",
          auto: true,
        });
        edgesCreated++;
      }

      previousNodeId = msgNode.id;
      messagesIngested++;
    }

    return {
      messages_ingested: messagesIngested,
      edges_created: edgesCreated,
      skipped: 0,
      conversation_id: convNode.id,
    };
  });

  return ok(result);
}
