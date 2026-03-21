import type { MemoryDbClient } from "../../db/memory-client.js";
import type { EmbeddingService } from "../../ingestion/embedding.js";
import type { SecretFilter } from "../../ingestion/secret-filter.js";
import type { NodeKind } from "../../db/memory-schema.js";
import { searchMemory } from "../../application/services/search-memory.js";
import { traverseMemory } from "../../application/services/traverse-memory.js";
import { assembleContext } from "../../application/services/assemble-context.js";
import type { ApiRequest, ApiResponse } from "../types.js";
import { appErr } from "../types.js";
import type {
  SearchMemorySchema,
  GetNodeSchema,
  GetNodeEdgesSchema,
  TraverseSchema,
  GetContextSchema,
  GetTopicsSchema,
  GetStatsSchema,
  IngestSchema,
  CreateLinkSchema,
  CreateNodeSchema,
  NodeResponse,
  EdgeResponse,
  SearchResult,
  TraverseResponse,
  ContextResponse,
  StatsResponse,
  IngestResponse,
} from "../schemas/memory-schemas.js";

export function createMemoryController(
  mdb: MemoryDbClient,
  embedService: EmbeddingService,
  filter: SecretFilter,
) {
  return {
    async search(
      req: ApiRequest<SearchMemorySchema>,
    ): Promise<ApiResponse<SearchResult[]>> {
      const { query, repo, mode, kinds, limit } = req.query;

      // P0: Return 503 if embedding model not ready and semantic search requested
      if ((mode === "semantic" || mode === "hybrid") && !embedService.isReady()) {
        return appErr({
          code: "EMBEDDING_NOT_READY",
          message: "Embedding model is not ready; use mode=keyword or retry later",
          statusHint: 503,
        });
      }

      // Parse comma-separated kinds string into array
      const kindsArray: NodeKind[] | undefined = kinds
        ? (kinds.split(",").map((k) => k.trim()).filter(Boolean) as NodeKind[])
        : undefined;

      const result = await searchMemory(mdb, embedService, {
        query,
        repo,
        mode,
        kinds: kindsArray,
        limit,
      });
      if (!result.ok) return appErr(result.error);
      return { ok: true, data: result.data };
    },

    async getNode(
      req: ApiRequest<GetNodeSchema>,
    ): Promise<ApiResponse<NodeResponse>> {
      const node = mdb.getNode(req.params.id);
      if (!node) {
        return appErr({ code: "NOT_FOUND", message: `Node ${req.params.id} not found`, statusHint: 404 });
      }
      return { ok: true, data: node };
    },

    async getNodeEdges(
      req: ApiRequest<GetNodeEdgesSchema>,
    ): Promise<ApiResponse<EdgeResponse[]>> {
      const edgesFrom = mdb.getEdgesFrom(req.params.id);
      const edgesTo = mdb.getEdgesTo(req.params.id);
      // Deduplicate by edge id (in case any edge appears in both directions)
      const seen = new Set<string>();
      const merged: EdgeResponse[] = [];
      for (const edge of [...edgesFrom, ...edgesTo]) {
        if (!seen.has(edge.id)) {
          seen.add(edge.id);
          merged.push(edge);
        }
      }
      return { ok: true, data: merged };
    },

    async traverse(
      req: ApiRequest<TraverseSchema>,
    ): Promise<ApiResponse<TraverseResponse>> {
      const { direction, edge_kinds, max_depth, max_nodes } = req.query;

      // Parse comma-separated edge_kinds string into array
      const edgeKindsArray: string[] | undefined = edge_kinds
        ? edge_kinds.split(",").map((k) => k.trim()).filter(Boolean)
        : undefined;

      const result = traverseMemory(mdb, {
        node_id: req.params.id,
        direction,
        edge_kinds: edgeKindsArray,
        max_depth,
        max_nodes,
      });
      if (!result.ok) return appErr(result.error);
      return { ok: true, data: result.data };
    },

    async getContext(
      req: ApiRequest<GetContextSchema>,
    ): Promise<ApiResponse<ContextResponse>> {
      const { query, node_id, repo, max_tokens } = req.query;
      const result = await assembleContext(mdb, embedService, {
        query,
        node_id,
        repo,
        max_tokens,
      });
      if (!result.ok) return appErr(result.error);
      // Map service ContextSection (has `relevance`) to schema ContextSection (has `token_estimate`)
      const data: ContextResponse = {
        summary: result.data.summary,
        token_estimate: result.data.token_estimate,
        sections: result.data.sections.map((s) => ({
          heading: s.heading,
          content: s.content,
          token_estimate: Math.ceil(s.content.length / 4),
        })),
      };
      return { ok: true, data };
    },

    async getTopics(
      req: ApiRequest<GetTopicsSchema>,
    ): Promise<ApiResponse<NodeResponse[]>> {
      const nodes = mdb.getNodesByRepoAndKind(req.query.repo, "topic");
      return { ok: true, data: nodes };
    },

    async getStats(
      req: ApiRequest<GetStatsSchema>,
    ): Promise<ApiResponse<StatsResponse>> {
      const stats = mdb.getStats(req.query.repo);
      return { ok: true, data: stats };
    },

    // Placeholder — wired fully in Task 16
    async ingest(
      _req: ApiRequest<IngestSchema>,
    ): Promise<ApiResponse<IngestResponse>> {
      return { ok: true, data: { ingested: 0 } };
    },

    async createLink(
      req: ApiRequest<CreateLinkSchema>,
    ): Promise<ApiResponse<EdgeResponse>> {
      const { from_node, to_node, kind, note } = req.body;

      // Filter secrets from the note field
      const filteredNote = note ? filter.redact(note) : "";

      const edge = mdb.insertEdge({
        repo: (mdb.getNode(from_node)?.repo ?? mdb.getNode(to_node)?.repo) ?? "",
        from_node,
        to_node,
        kind,
        weight: 1.0,
        meta: filteredNote ? JSON.stringify({ note: filteredNote }) : "{}",
        auto: false,
      });
      return { ok: true, data: edge };
    },

    async createNode(
      req: ApiRequest<CreateNodeSchema>,
    ): Promise<ApiResponse<NodeResponse>> {
      const { repo, kind, title, body, related_to } = req.body;

      // Filter secrets from title and body
      const filteredTitle = filter.redact(title);
      const filteredBody = body ? filter.redact(body) : "";

      const node = mdb.insertNode({
        repo,
        kind,
        title: filteredTitle,
        body: filteredBody,
        meta: "{}",
        source_id: "",
        source_type: "manual",
      });

      // If related_to is provided, create a related_to edge
      if (related_to) {
        const relatedNode = mdb.getNode(related_to);
        if (relatedNode) {
          mdb.insertEdge({
            repo,
            from_node: node.id,
            to_node: related_to,
            kind: "related_to",
            weight: 1.0,
            meta: "{}",
            auto: false,
          });
        }
      }

      return { ok: true, data: node };
    },
  };
}
