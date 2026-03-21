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

  let decisions_created = 0;
  let edges_created = 0;

  // Dedup: track seen decision titles per conversation
  // Key format: `${conversationId}|${normalizedTitle}`
  const seen = new Set<string>();

  mdb.transaction(() => {
    for (const messageNode of messages) {
      const body = messageNode.body;
      if (!body) continue;

      // 4. Find the containing conversation via incoming `contains` edges
      const incomingEdges = mdb.getEdgesTo(messageNode.id);
      const containsEdge = incomingEdges.find((e) => e.kind === "contains");
      const conversationId = containsEdge?.from_node ?? null;

      // 2. Test against all DECISION_PATTERNS
      for (const pattern of DECISION_PATTERNS) {
        // Reset lastIndex since patterns use the /g flag
        pattern.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = pattern.exec(body)) !== null) {
          const captured = match[1];
          if (!captured) continue;

          const title = captured.trim();
          if (title.length < 5) continue;

          // 6. Dedup check: same title in same conversation
          const dedupeConvKey = conversationId ?? "__no_conversation__";
          const key = `${dedupeConvKey}|${title.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);

          // 3. Create a decision node
          const context = extractContext(body, match.index);
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
            source_id: `decision-${messageNode.source_id}-${decisions_created}`,
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
