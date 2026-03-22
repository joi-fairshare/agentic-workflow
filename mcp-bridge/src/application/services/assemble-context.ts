// mcp-bridge/src/application/services/assemble-context.ts
import type { MemoryDbClient, NodeRow } from "../../db/memory-client.js";
import type { EmbeddingService } from "../../ingestion/embedding.js";
import type { AppResult } from "../result.js";
import { ok, err } from "../result.js";
import { searchMemory } from "./search-memory.js";
import { traverseMemory } from "./traverse-memory.js";

// ── Constants ────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4;

// ── Types ────────────────────────────────────────────────────

export interface AssembleContextInput {
  query?: string;
  node_id?: string;
  repo: string;
  max_tokens?: number;
}

export interface ContextSection {
  heading: string;
  content: string;
  relevance: number;
  node_ids: string[];
}

export interface AssembleContextResult {
  summary: string;
  sections: ContextSection[];
  token_estimate: number;
}

// ── Helpers ──────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function formatNode(node: NodeRow): string {
  return `**${node.title}** (${node.kind})\n${node.body}`;
}

// ── Service ──────────────────────────────────────────────────

export async function assembleContext(
  mdb: MemoryDbClient,
  embedService: EmbeddingService,
  input: AssembleContextInput,
): Promise<AppResult<AssembleContextResult>> {
  const { repo, max_tokens = 8000 } = input;

  if (!input.query && !input.node_id) {
    return err({ code: "VALIDATION_ERROR", message: "Either query or node_id is required", statusHint: 400 });
  }

  // Step 1: Find entry-point nodes
  const entryNodes: Array<{ node: NodeRow; score: number }> = [];

  if (input.query) {
    const searchResult = await searchMemory(mdb, embedService, {
      query: input.query,
      repo,
      mode: "hybrid",
      limit: 10,
    });
    if (searchResult.ok) {
      for (const sr of searchResult.data) {
        // Re-fetch the full NodeRow here even though searchMemory already returned
        // node_id/kind/title/body, because SearchResult.body is capped at 500 chars
        // and formatNode uses the full body. The full NodeRow fields (meta, source_id,
        // source_type) are also needed for downstream traversal. The 10-node limit
        // keeps this to at most 10 extra queries per assembleContext call.
        const node = mdb.getNode(sr.node_id);
        if (node) entryNodes.push({ node, score: sr.score });
      }
    }
  }

  if (input.node_id) {
    const node = mdb.getNode(input.node_id);
    if (node) {
      // Add with high score if not already present
      if (!entryNodes.some((e) => e.node.id === node.id)) {
        entryNodes.push({ node, score: 1.0 });
      }
    }
  }

  // Step 2: Traverse outward from entry nodes to find related context
  const allNodes = new Map<string, { node: NodeRow; score: number }>();
  for (const entry of entryNodes) {
    allNodes.set(entry.node.id, entry);
  }

  for (const entry of entryNodes.slice(0, 5)) {
    const traverseResult = traverseMemory(mdb, {
      node_id: entry.node.id,
      direction: "both",
      max_depth: 2,
      max_nodes: 20,
    });
    if (traverseResult.ok) {
      for (const neighbor of traverseResult.data.nodes) {
        if (!allNodes.has(neighbor.id)) {
          // Neighbors get a reduced score based on parent's score
          allNodes.set(neighbor.id, { node: neighbor, score: entry.score * 0.5 });
        }
      }
    }
  }

  // Step 3: Rank by relevance score
  const ranked = [...allNodes.values()]
    .sort((a, b) => b.score - a.score);

  // Step 4: Greedily pack into token budget
  const sections: ContextSection[] = [];
  let totalTokens = 0;

  for (const { node, score } of ranked) {
    const content = formatNode(node);
    const sectionTokens = estimateTokens(content);

    if (totalTokens + sectionTokens > max_tokens) continue;

    sections.push({
      heading: `${node.kind}: ${node.title}`,
      content: node.body,
      relevance: score,
      node_ids: [node.id],
    });
    totalTokens += sectionTokens;
  }

  // Step 5: Build summary
  const kindCounts = new Map<string, number>();
  for (const s of sections) {
    const kind = s.heading.split(":")[0];
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }
  const parts = [...kindCounts.entries()].map(([k, c]) => `${c} ${k}(s)`);
  const summary = sections.length > 0
    ? `Found ${sections.length} relevant items: ${parts.join(", ")}.`
    : "No relevant context found.";

  return ok({
    summary,
    sections,
    token_estimate: totalTokens,
  });
}
