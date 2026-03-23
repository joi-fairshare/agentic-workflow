import { z } from "zod";
import { NODE_KINDS, EDGE_KINDS } from "../../db/memory-schema.js";

// ── Shared enums (derived from single source in memory-schema) ──

export const NodeKindSchema = z.enum(NODE_KINDS);
export type NodeKind = z.infer<typeof NodeKindSchema>;

export const EdgeKindSchema = z.enum(EDGE_KINDS);
export type EdgeKind = z.infer<typeof EdgeKindSchema>;

// ── Shared response shapes ─────────────────────────────────

export const NodeResponseSchema = z.object({
  id: z.string(),
  repo: z.string(),
  kind: NodeKindSchema,
  title: z.string(),
  body: z.string(),
  meta: z.string(),
  source_id: z.string(),
  source_type: z.string(),
  sender: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type NodeResponse = z.infer<typeof NodeResponseSchema>;

export const EdgeResponseSchema = z.object({
  id: z.string(),
  repo: z.string(),
  from_node: z.string(),
  to_node: z.string(),
  kind: EdgeKindSchema,
  weight: z.number(),
  meta: z.string(),
  auto: z.number(),
  created_at: z.string(),
});
export type EdgeResponse = z.infer<typeof EdgeResponseSchema>;

export const SearchResultSchema = z.object({
  node_id: z.string(),
  kind: NodeKindSchema,
  title: z.string(),
  body: z.string(),
  score: z.number(),
  match_type: z.enum(["keyword", "semantic", "hybrid"]),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

// ── search_memory ──────────────────────────────────────────

export const SearchMemoryQuerySchema = z.object({
  query: z.string(),
  repo: z.string(),
  mode: z.enum(["semantic", "keyword", "hybrid"]).default("hybrid"),
  kinds: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  sender: z.string().optional(),
});
export type SearchMemoryQuery = z.infer<typeof SearchMemoryQuerySchema>;

export const SearchMemorySchema = {
  querystring: SearchMemoryQuerySchema,
  response: z.array(SearchResultSchema),
} as const;
export type SearchMemorySchema = typeof SearchMemorySchema;

// ── get_node ───────────────────────────────────────────────

export const NodeParamsSchema = z.object({
  id: z.string(),
});
export type NodeParams = z.infer<typeof NodeParamsSchema>;

export const GetNodeSchema = {
  params: NodeParamsSchema,
  response: NodeResponseSchema,
} as const;
export type GetNodeSchema = typeof GetNodeSchema;

// ── get_node_by_source ────────────────────────────────────

export const NodeBySourceParamsSchema = z.object({
  source_type: z.string(),
  source_id: z.string(),
});
export type NodeBySourceParams = z.infer<typeof NodeBySourceParamsSchema>;

export const GetNodeBySourceSchema = {
  params: NodeBySourceParamsSchema,
  response: NodeResponseSchema,
} as const;
export type GetNodeBySourceSchema = typeof GetNodeBySourceSchema;

// ── get_node_edges ─────────────────────────────────────────

export const GetNodeEdgesSchema = {
  params: NodeParamsSchema,
  response: z.array(EdgeResponseSchema),
} as const;
export type GetNodeEdgesSchema = typeof GetNodeEdgesSchema;

// ── traverse ───────────────────────────────────────────────

export const TraverseParamsSchema = z.object({
  id: z.string(),
});
export type TraverseParams = z.infer<typeof TraverseParamsSchema>;

export const TraverseQuerySchema = z.object({
  direction: z.enum(["outgoing", "incoming", "both"]).default("both"),
  edge_kinds: z.string().optional(),
  max_depth: z.coerce.number().min(1).max(10).default(3),
  max_nodes: z.coerce.number().min(1).max(200).default(50),
  agent: z.string().max(64).regex(/^[a-zA-Z0-9_-]+$/).default("anonymous"),
  sender: z.string().optional(),
});
export type TraverseQuery = z.infer<typeof TraverseQuerySchema>;

export const TraverseResponseSchema = z.object({
  root: z.string(),
  nodes: z.array(NodeResponseSchema),
  edges: z.array(EdgeResponseSchema),
});
export type TraverseResponse = z.infer<typeof TraverseResponseSchema>;

export const TraverseSchema = {
  params: TraverseParamsSchema,
  querystring: TraverseQuerySchema,
  response: TraverseResponseSchema,
} as const;
export type TraverseSchema = typeof TraverseSchema;

// ── get_context ────────────────────────────────────────────

export const ContextQuerySchema = z.object({
  query: z.string().optional(),
  node_id: z.string().optional(),
  repo: z.string(),
  max_tokens: z.coerce.number().min(1).max(32000).default(8000),
  agent: z.string().max(64).regex(/^[a-zA-Z0-9_-]+$/).default("anonymous"),
});
export type ContextQuery = z.infer<typeof ContextQuerySchema>;

export const ContextSectionSchema = z.object({
  heading: z.string(),
  content: z.string(),
  token_estimate: z.number(),
  relevance: z.number(),
  node_ids: z.array(z.string()).default([]),
});
export type ContextSection = z.infer<typeof ContextSectionSchema>;

export const ContextResponseSchema = z.object({
  summary: z.string(),
  sections: z.array(ContextSectionSchema),
  token_estimate: z.number(),
});
export type ContextResponse = z.infer<typeof ContextResponseSchema>;

export const GetContextSchema = {
  querystring: ContextQuerySchema,
  response: ContextResponseSchema,
} as const;
export type GetContextSchema = typeof GetContextSchema;

// ── get_topics ─────────────────────────────────────────────

export const RepoQuerySchema = z.object({
  repo: z.string(),
});
export type RepoQuery = z.infer<typeof RepoQuerySchema>;

export const GetTopicsSchema = {
  querystring: RepoQuerySchema,
  response: z.array(NodeResponseSchema),
} as const;
export type GetTopicsSchema = typeof GetTopicsSchema;

// ── list_conversations ────────────────────────────────────

export const ListConversationsQuerySchema = z.object({
  repo: z.string(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});
export type ListConversationsQuery = z.infer<typeof ListConversationsQuerySchema>;

export const ConversationItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  repo: z.string(),
  source_type: z.string(),
  source_id: z.string(),
  message_count: z.number(),
  created_at: z.string(),
  meta: z.string(),
});
export type ConversationItem = z.infer<typeof ConversationItemSchema>;

export const ListConversationsResponseSchema = z.object({
  conversations: z.array(ConversationItemSchema),
  total: z.number(),
});
export type ListConversationsResponse = z.infer<typeof ListConversationsResponseSchema>;

export const ListConversationsSchema = {
  querystring: ListConversationsQuerySchema,
  response: ListConversationsResponseSchema,
} as const;
export type ListConversationsSchema = typeof ListConversationsSchema;

// ── get_repos ──────────────────────────────────────────────

export const GetReposSchema = {
  response: z.array(z.string()),
} as const;
export type GetReposSchema = typeof GetReposSchema;

// ── get_stats ──────────────────────────────────────────────

export const StatsResponseSchema = z.object({
  node_count: z.number(),
  edge_count: z.number(),
});
export type StatsResponse = z.infer<typeof StatsResponseSchema>;

export const GetStatsSchema = {
  querystring: RepoQuerySchema,
  response: StatsResponseSchema,
} as const;
export type GetStatsSchema = typeof GetStatsSchema;

// ── ingest ─────────────────────────────────────────────────

export const IngestBodySchema = z.object({
  repo: z.string(),
  source: z.enum(["bridge", "transcript", "git", "generic", "claude-code"]),
  session_id: z.string().optional(),
  title: z.string().optional(),
  path: z.string().optional(),
  content: z.string().optional(),
  agent: z.string().max(64).regex(/^[a-zA-Z0-9_-]+$/).default("anonymous"),
});
export type IngestBody = z.infer<typeof IngestBodySchema>;

export const IngestResponseSchema = z.object({
  conversation_id: z.string(),
  messages_ingested: z.number(),
  edges_created: z.number(),
  skipped: z.number(),
});
export type IngestResponse = z.infer<typeof IngestResponseSchema>;

export const IngestSchema = {
  body: IngestBodySchema,
  response: IngestResponseSchema,
} as const;
export type IngestSchema = typeof IngestSchema;

// ── expand_node ─────────────────────────────────────────────

export const ExpandNodeSchema = {
  params: z.object({ id: z.string() }),
  response: z.object({
    nodes_created: z.number(),
    edges_created: z.number(),
    nodes: z.array(NodeResponseSchema),
    edges: z.array(EdgeResponseSchema),
  }),
} as const;
export type ExpandNodeSchema = typeof ExpandNodeSchema;

// ── create_link ────────────────────────────────────────────

export const CreateLinkBodySchema = z.object({
  from_node: z.string(),
  to_node: z.string(),
  kind: EdgeKindSchema,
  note: z.string().optional(),
});
export type CreateLinkBody = z.infer<typeof CreateLinkBodySchema>;

export const CreateLinkSchema = {
  body: CreateLinkBodySchema,
  response: EdgeResponseSchema,
} as const;
export type CreateLinkSchema = typeof CreateLinkSchema;

// ── create_node ────────────────────────────────────────────

export const CreateNodeBodySchema = z.object({
  repo: z.string(),
  kind: z.enum(["topic", "decision"]),
  title: z.string(),
  body: z.string().optional(),
  related_to: z.string().optional(),
});
export type CreateNodeBody = z.infer<typeof CreateNodeBodySchema>;

export const CreateNodeSchema = {
  body: CreateNodeBodySchema,
  response: NodeResponseSchema,
} as const;
export type CreateNodeSchema = typeof CreateNodeSchema;

// ── traversal_logs ─────────────────────────────────────────

export const TraversalLogStepSchema = z.object({
  node_id: z.string(),
  parent_id: z.string().nullable(),
  edge_id: z.string().nullable(),
  edge_kind: z.string().nullable(),
});

export const TraversalLogResponseSchema = z.object({
  id: z.string(),
  repo: z.string(),
  agent: z.string(),
  operation: z.enum(["traverse", "context"]),
  start_node: z.string().nullable(),
  params: z.record(z.unknown()),
  steps: z.array(TraversalLogStepSchema),
  scores: z.record(z.number()).optional(),
  token_allocation: z.record(z.number()).optional(),
  created_at: z.string(),
});
export type TraversalLogResponse = z.infer<typeof TraversalLogResponseSchema>;

export const TraversalLogsQuerySchema = {
  querystring: z.object({
    repo: z.string(),
    limit: z.coerce.number().min(1).max(100).default(20),
  }),
  response: z.array(TraversalLogResponseSchema),
} as const;
export type TraversalLogsQuerySchema = typeof TraversalLogsQuerySchema;

export const TraversalLogParamsSchema = {
  params: z.object({ id: z.string() }),
  response: TraversalLogResponseSchema,
} as const;
export type TraversalLogParamsSchema = typeof TraversalLogParamsSchema;

export const SendersQuerySchema = {
  querystring: z.object({ repo: z.string() }),
  response: z.array(z.string()),
} as const;
export type SendersQuerySchema = typeof SendersQuerySchema;
