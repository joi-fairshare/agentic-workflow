import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { MemoryDbClient } from "../../db/memory-client.js";
import type { EmbeddingService } from "../../ingestion/embedding.js";
import type { SecretFilter } from "../../ingestion/secret-filter.js";
import { NODE_KINDS, type NodeKind } from "../../db/memory-schema.js";
import { searchMemory } from "../../application/services/search-memory.js";
import { traverseMemory } from "../../application/services/traverse-memory.js";
import { assembleContext } from "../../application/services/assemble-context.js";
import { ingestGenericChat } from "../../application/services/ingest-generic.js";
import { ingestClaudeCodeSummary, expandClaudeCodeTurn } from "../../application/services/ingest-claude-code.js";
import { ingestTranscriptLines } from "../../application/services/ingest-transcript.js";
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
  ExpandNodeSchema,
  CreateLinkSchema,
  CreateNodeSchema,
  GetNodeBySourceSchema,
  TraversalLogsQuerySchema,
  TraversalLogParamsSchema,
  SendersQuerySchema,
  GetReposSchema,
  ListConversationsSchema,
  ListConversationsResponse,
  TraversalLogResponse,
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

      // Parse comma-separated kinds string into array, validating each against NODE_KINDS
      const kindsArray: NodeKind[] | undefined = kinds
        ? kinds.split(",").map((k) => k.trim()).filter((k): k is NodeKind => (NODE_KINDS as readonly string[]).includes(k))
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

    async getNodeBySource(
      req: ApiRequest<GetNodeBySourceSchema>,
    ): Promise<ApiResponse<NodeResponse>> {
      const node = mdb.getNodeBySource(req.params.source_type, req.params.source_id);
      if (!node) {
        return appErr({ code: "NOT_FOUND", message: `No node with source_type=${req.params.source_type} source_id=${req.params.source_id}`, statusHint: 404 });
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
      const { direction, edge_kinds, max_depth, max_nodes, agent, sender } = req.query;

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
        sender,
      });
      if (!result.ok) return appErr(result.error);

      // Record traversal log — failure does not break the response
      const startNode = mdb.getNode(req.params.id);
      try {
        mdb.insertTraversalLog({
          repo: startNode?.repo ?? "unknown",
          agent,
          operation: "traverse",
          start_node: req.params.id,
          params: { direction, edge_kinds, max_depth, max_nodes },
          steps: result.data.steps,
        });
      } catch {
        // Log failure is non-fatal
      }

      return { ok: true, data: result.data };
    },

    async getContext(
      req: ApiRequest<GetContextSchema>,
    ): Promise<ApiResponse<ContextResponse>> {
      const { query, node_id, repo, max_tokens, agent } = req.query;
      const result = await assembleContext(mdb, embedService, {
        query,
        node_id,
        repo,
        max_tokens,
      });
      if (!result.ok) return appErr(result.error);
      // Map service ContextSection to schema ContextSection (include both token_estimate and relevance)
      const data: ContextResponse = {
        summary: result.data.summary,
        token_estimate: result.data.token_estimate,
        sections: result.data.sections.map((s) => ({
          heading: s.heading,
          content: s.content,
          token_estimate: Math.ceil(s.content.length / 4),
          relevance: s.relevance,
          node_ids: s.node_ids,
        })),
      };

      // Record context traversal log — failure does not break the response
      try {
        const allNodeIds = result.data.sections.flatMap((s) => s.node_ids);
        const steps = allNodeIds.map((nid) => ({
          node_id: nid,
          parent_id: null,
          edge_id: null,
          edge_kind: null,
        }));
        mdb.insertTraversalLog({
          repo,
          agent,
          operation: "context",
          start_node: node_id ?? null,
          params: { query, node_id, max_tokens },
          steps,
        });
      } catch {
        // Log failure is non-fatal
      }

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

    async ingest(
      req: ApiRequest<IngestSchema>,
    ): Promise<ApiResponse<IngestResponse>> {
      const { repo, source, session_id, title, path, content } = req.body;

      if (source === "bridge") {
        return appErr({
          code: "UNSUPPORTED_SOURCE",
          message: "bridge ingestion is done via MCP events, not REST",
          statusHint: 400,
        });
      }

      if (source === "git") {
        return appErr({
          code: "UNSUPPORTED_SOURCE",
          message: "git ingestion is not supported via REST",
          statusHint: 400,
        });
      }

      if (source === "generic") {
        if (!content) {
          return appErr({ code: "VALIDATION", message: "content is required for generic source", statusHint: 400 });
        }
        if (!session_id) {
          return appErr({ code: "VALIDATION", message: "session_id is required for generic source", statusHint: 400 });
        }
        let messages: Array<{ role: string; content: string; timestamp?: string }>;
        try {
          messages = JSON.parse(content) as Array<{ role: string; content: string; timestamp?: string }>;
        } catch {
          return appErr({ code: "VALIDATION", message: "content must be a valid JSON array of messages", statusHint: 400 });
        }
        const result = ingestGenericChat(mdb, filter, {
          repo,
          sessionId: session_id,
          sessionTitle: title ?? session_id,
          messages,
        });
        if (!result.ok) return appErr(result.error);
        return { ok: true, data: result.data };
      }

      if (source === "claude-code") {
        if (!path) {
          return appErr({ code: "VALIDATION", message: "path is required for claude-code source", statusHint: 400 });
        }
        if (!session_id) {
          return appErr({ code: "VALIDATION", message: "session_id is required for claude-code source", statusHint: 400 });
        }
        let lines: string[];
        try {
          const raw = readFileSync(path, "utf-8");
          lines = raw.split("\n").filter((l) => l.trim().length > 0);
        } catch {
          return appErr({ code: "IO_ERROR", message: `Failed to read file: ${path}`, statusHint: 400 });
        }
        const result = ingestClaudeCodeSummary(mdb, filter, {
          repo,
          sessionId: session_id,
          filePath: path,
          lines,
        });
        if (!result.ok) return appErr(result.error);
        return { ok: true, data: result.data };
      }

      // source === "transcript"
      if (!path) {
        return appErr({ code: "VALIDATION", message: "path is required for transcript source", statusHint: 400 });
      }
      if (!session_id) {
        return appErr({ code: "VALIDATION", message: "session_id is required for transcript source", statusHint: 400 });
      }
      let lines: string[];
      try {
        const raw = readFileSync(path, "utf-8");
        lines = raw.split("\n").filter((l) => l.trim().length > 0);
      } catch {
        return appErr({ code: "IO_ERROR", message: `Failed to read file: ${path}`, statusHint: 400 });
      }
      const transcriptResult = ingestTranscriptLines(mdb, filter, {
        repo,
        sessionId: session_id,
        sessionTitle: title ?? session_id,
        lines,
      });
      if (!transcriptResult.ok) return appErr(transcriptResult.error);
      return {
        ok: true,
        data: {
          conversation_id: session_id,
          messages_ingested: transcriptResult.data.messages_ingested,
          edges_created: transcriptResult.data.edges_created,
          skipped: transcriptResult.data.skipped,
        },
      };
    },

    async expand(
      req: ApiRequest<ExpandNodeSchema>,
    ): Promise<ApiResponse<{ nodes_created: number; edges_created: number; nodes: NodeResponse[]; edges: EdgeResponse[] }>> {
      const turnNodeId = req.params.id;

      // Read the turn node to get the file_path from metadata
      const turnNode = mdb.getNode(turnNodeId);
      if (!turnNode) {
        return appErr({ code: "NOT_FOUND", message: `Node ${turnNodeId} not found`, statusHint: 404 });
      }

      // Parse metadata to get file_path
      let meta: Record<string, unknown>;
      try {
        meta = JSON.parse(turnNode.meta) as Record<string, unknown>;
      } catch {
        return appErr({ code: "INTERNAL_ERROR", message: "Failed to parse node metadata", statusHint: 500 });
      }

      // Get the conversation node to find the file_path
      const convEdges = mdb.getEdgesTo(turnNodeId);
      const containsEdge = convEdges.find((e) => e.kind === "contains");
      let filePath: string | undefined = meta.file_path as string | undefined;

      if (!filePath && containsEdge) {
        const convNode = mdb.getNode(containsEdge.from_node);
        if (convNode) {
          let convMeta: Record<string, unknown>;
          try {
            convMeta = JSON.parse(convNode.meta) as Record<string, unknown>;
            filePath = convMeta.file_path as string | undefined;
          } catch {
            // ignore parse error
          }
        }
      }

      if (!filePath) {
        return appErr({ code: "VALIDATION", message: "Cannot determine file_path for expansion", statusHint: 400 });
      }

      let lines: string[];
      try {
        const raw = readFileSync(filePath, "utf-8");
        lines = raw.split("\n").filter((l) => l.trim().length > 0);
      } catch {
        return appErr({ code: "IO_ERROR", message: `Failed to read file: ${filePath}`, statusHint: 400 });
      }

      const result = expandClaudeCodeTurn(mdb, filter, turnNodeId, lines);
      if (!result.ok) return appErr(result.error);

      // Collect newly created child nodes and edges
      const childEdges = mdb.getEdgesFrom(turnNodeId).filter((e) => e.kind === "contains");
      const childNodes: NodeResponse[] = [];
      for (const edge of childEdges) {
        const node = mdb.getNode(edge.to_node);
        if (node) childNodes.push(node);
      }

      return {
        ok: true,
        data: {
          nodes_created: result.data.nodes_created,
          edges_created: result.data.edges_created,
          nodes: childNodes,
          edges: childEdges,
        },
      };
    },

    async createLink(
      req: ApiRequest<CreateLinkSchema>,
    ): Promise<ApiResponse<EdgeResponse>> {
      const { from_node, to_node, kind, note } = req.body;

      // Validate both nodes exist before entering the transaction.
      const fromNodeRow = mdb.getNode(from_node);
      if (!fromNodeRow) {
        return appErr({ code: "NOT_FOUND", message: `Node ${from_node} not found`, statusHint: 404 });
      }
      const toNodeRow = mdb.getNode(to_node);
      if (!toNodeRow) {
        return appErr({ code: "NOT_FOUND", message: `Node ${to_node} not found`, statusHint: 404 });
      }

      // Filter secrets from the note field
      const filteredNote = note ? filter.redact(note) : "";

      // Wrap edge creation in a transaction so the insert is atomic.
      const edge = mdb.transaction(() =>
        mdb.insertEdge({
          repo: fromNodeRow.repo,
          from_node,
          to_node,
          kind,
          weight: 1.0,
          meta: filteredNote ? JSON.stringify({ note: filteredNote }) : "{}",
          auto: false,
        })
      );
      return { ok: true, data: edge };
    },

    async createNode(
      req: ApiRequest<CreateNodeSchema>,
    ): Promise<ApiResponse<NodeResponse>> {
      const { repo, kind, title, body, related_to } = req.body;

      // Filter secrets from title and body
      const filteredTitle = filter.redact(title);
      const filteredBody = body ? filter.redact(body) : "";

      // Wrap node + optional edge creation in a transaction so they succeed or fail together.
      const node = mdb.transaction(() => {
        const inserted = mdb.insertNode({
          repo,
          kind,
          title: filteredTitle,
          body: filteredBody,
          meta: "{}",
          source_id: randomUUID(),
          source_type: "manual",
        });

        // If related_to is provided, create a related_to edge
        if (related_to) {
          const relatedNode = mdb.getNode(related_to);
          if (relatedNode) {
            mdb.insertEdge({
              repo,
              from_node: inserted.id,
              to_node: related_to,
              kind: "related_to",
              weight: 1.0,
              meta: "{}",
              auto: false,
            });
          }
        }

        return inserted;
      });

      return { ok: true, data: node };
    },

    async getTraversalLogs(
      req: ApiRequest<TraversalLogsQuerySchema>,
    ): Promise<ApiResponse<TraversalLogResponse[]>> {
      const { repo, limit } = req.query;
      const logs = mdb.getTraversalLogs(repo, limit);
      return { ok: true, data: logs };
    },

    async getTraversalLog(
      req: ApiRequest<TraversalLogParamsSchema>,
    ): Promise<ApiResponse<TraversalLogResponse>> {
      const log = mdb.getTraversalLog(req.params.id);
      if (!log) {
        return appErr({ code: "NOT_FOUND", message: `Traversal log ${req.params.id} not found`, statusHint: 404 });
      }
      return { ok: true, data: log };
    },

    async getSenders(
      req: ApiRequest<SendersQuerySchema>,
    ): Promise<ApiResponse<string[]>> {
      const senders = mdb.getDistinctSenders(req.query.repo);
      return { ok: true, data: senders };
    },

    async getRepos(): Promise<ApiResponse<string[]>> {
      const repos = mdb.getDistinctRepos();
      return { ok: true, data: repos };
    },

    async listConversations(
      req: ApiRequest<ListConversationsSchema>,
    ): Promise<ApiResponse<ListConversationsResponse>> {
      const { repo, limit, offset } = req.query;
      const nodes = mdb.getConversationNodes(repo, limit, offset);
      const total = mdb.countConversationNodes(repo);

      const conversations = nodes.map((n) => {
        const childEdges = mdb.getEdgesFrom(n.id).filter((e) => e.kind === "contains");
        return {
          id: n.id,
          title: n.title,
          repo: n.repo,
          source_type: n.source_type,
          source_id: n.source_id,
          message_count: childEdges.length,
          created_at: n.created_at,
          meta: n.meta,
        };
      });

      return { ok: true, data: { conversations, total } };
    },
  };
}
