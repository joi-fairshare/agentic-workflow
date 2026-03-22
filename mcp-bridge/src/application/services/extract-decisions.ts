// mcp-bridge/src/application/services/extract-decisions.ts
import type { MemoryDbClient } from "../../db/memory-client.js";
import type { AppResult } from "../result.js";
import { ok } from "../result.js";

// ── Types ─────────────────────────────────────────────────────

export interface ExtractDecisionsInput {
  repo: string;
}

export interface ExtractDecisionsResult {
  decisions_created: number;
  edges_created: number;
}

// ── Decision Patterns ─────────────────────────────────────────

const DECISION_PATTERNS = [
  /(?:we|I)\s+decided\s+(?:to|that|on)\s+(.{10,120})/gi,
  /(?:the\s+)?decision\s+(?:is|was)\s+(?:to\s+)?(.{10,120})/gi,
  /going\s+(?:with|for)\s+(.{10,80})/gi,
  /chose\s+(.{10,80})\s+over\s+/gi,
  /(?:we(?:'re|'ll| will| are))\s+(?:use|using|adopt|go with)\s+(.{5,80})/gi,
  /(?:let(?:'s|us))\s+(?:use|go with|switch to|adopt)\s+(.{5,80})/gi,
];

// ── Surrounding Context ───────────────────────────────────────

/**
 * Extract a brief surrounding context snippet from the full message body,
 * centred on the match index.
 */
function extractContext(body: string, matchIndex: number): string {
  const CONTEXT_CHARS = 200;
  const start = Math.max(0, matchIndex - CONTEXT_CHARS / 2);
  const end = Math.min(body.length, matchIndex + CONTEXT_CHARS / 2);
  const snippet = body.slice(start, end).trim();
  return snippet;
}

// ── Service ───────────────────────────────────────────────────

/** Scan message nodes for decision patterns and create decision nodes. */
export function extractDecisions(
  mdb: MemoryDbClient,
  input: ExtractDecisionsInput,
): AppResult<ExtractDecisionsResult> {
  const { repo } = input;

  // 1. Fetch all message-kind nodes for the repo
  const messages = mdb.getNodesByRepoAndKind(repo, "message");

  // Pre-build a message → conversation mapping to avoid N+1 getEdgesTo queries.
  // Iterate conversation nodes once and collect their outgoing `contains` edges,
  // building a Map<messageId, conversationId> before the main loop.
  const messageToConversation = new Map<string, string>();
  const conversations = mdb.getNodesByRepoAndKind(repo, "conversation");
  for (const conv of conversations) {
    const outEdges = mdb.getEdgesFrom(conv.id);
    for (const edge of outEdges) {
      if (edge.kind === "contains") {
        messageToConversation.set(edge.to_node, conv.id);
      }
    }
  }

  let decisions_created = 0;
  let edges_created = 0;

  // Dedup: track seen decision titles per conversation
  // Key format: `${conversationId}|${normalizedTitle}`
  const seen = new Set<string>();

  mdb.transaction(() => {
    for (const messageNode of messages) {
      const body = messageNode.body;
      if (!body) continue;

      // 4. Look up the containing conversation from the pre-built map (no extra query).
      const conversationId = messageToConversation.get(messageNode.id) ?? null;

      // 2. Test against all DECISION_PATTERNS
      for (const pattern of DECISION_PATTERNS) {
        // Reset lastIndex since patterns use the /g flag
        pattern.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = pattern.exec(body)) !== null) {
          const captured = match[1];
          /* v8 ignore next */
          if (!captured) continue;

          const title = captured.trim();
          /* v8 ignore next */
          if (title.length < 5) continue;

          // 6. Dedup check: same title in same conversation
          const dedupeConvKey = conversationId ?? "__no_conversation__";
          const key = `${dedupeConvKey}|${title.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);

          // 3. Create a decision node — idempotent via a deterministic source_id.
          // The source_id is derived from the message node id + match offset so
          // re-running extractDecisions on the same corpus yields the same source_id
          // and the unique index on (source_type, source_id) prevents duplicates.
          const context = extractContext(body, match.index);
          const deterministicSourceId = `decision-${messageNode.id}-${match.index}`;
          const existing = mdb.getNodeBySource("extract-decisions", deterministicSourceId);
          if (existing) {
            decisions_created++;
            continue;
          }
          const decisionNode = mdb.insertNode({
            repo,
            kind: "decision",
            title,
            body: context,
            meta: JSON.stringify({
              auto: true,
              source_message_id: messageNode.id,
              pattern: pattern.source,
            }),
            source_id: deterministicSourceId,
            source_type: "extract-decisions",
          });
          decisions_created++;

          // 5. Create `decided_in` edge from decision → conversation (if found)
          if (conversationId !== null) {
            mdb.insertEdge({
              repo,
              from_node: decisionNode.id,
              to_node: conversationId,
              kind: "decided_in",
              weight: 1.0,
              meta: "{}",
              auto: true,
            });
            edges_created++;
          }
        }
      }
    }
  });

  return ok({ decisions_created, edges_created });
}
