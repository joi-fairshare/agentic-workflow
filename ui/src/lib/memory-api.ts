const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (json && typeof json === "object" && "ok" in json) {
    if (!json.ok) throw new Error(json.error?.message ?? "Unknown error");
    return json.data as T;
  }
  return json as T;
}

export interface SearchResult {
  node_id: string;
  kind: string;
  title: string;
  body: string;
  score: number;
  match_type: "keyword" | "semantic" | "hybrid";
}

export interface NodeResponse {
  id: string;
  repo: string;
  kind: string;
  title: string;
  body: string;
  meta: string;
  source_id: string;
  source_type: string;
  created_at: string;
  updated_at: string;
  sender?: string;
}

export interface EdgeResponse {
  id: string;
  repo: string;
  from_node: string;
  to_node: string;
  kind: string;
  weight: number;
  meta: string;
  auto: number;
  created_at: string;
}

export interface TraverseResponse {
  root: string;
  nodes: NodeResponse[];
  edges: EdgeResponse[];
}

export interface ContextSection {
  heading: string;
  content: string;
  relevance: number;
  token_estimate: number;
  node_ids: string[];
}

export interface ContextResponse {
  summary: string;
  sections: ContextSection[];
  token_estimate: number;
}

export interface StatsResponse {
  node_count: number;
  edge_count: number;
}

export async function searchMemory(
  query: string,
  repo: string,
  mode?: string,
  kinds?: string[],
): Promise<SearchResult[]> {
  const params = new URLSearchParams({ query, repo });
  if (mode) params.set("mode", mode);
  if (kinds && kinds.length > 0) params.set("kinds", kinds.join(","));
  return get<SearchResult[]>(`/memory/search?${params.toString()}`);
}

export async function getMemoryNode(id: string): Promise<NodeResponse> {
  return get<NodeResponse>(`/memory/node/${encodeURIComponent(id)}`);
}

export async function getMemoryNodeBySource(sourceType: string, sourceId: string): Promise<NodeResponse> {
  return get<NodeResponse>(`/memory/node/by-source/${encodeURIComponent(sourceType)}/${encodeURIComponent(sourceId)}`);
}

export async function getMemoryNodeEdges(id: string): Promise<EdgeResponse[]> {
  return get<EdgeResponse[]>(`/memory/node/${encodeURIComponent(id)}/edges`);
}

export async function traverseMemory(
  id: string,
  options?: {
    direction?: string;
    edge_kinds?: string;
    max_depth?: number;
    max_nodes?: number;
  },
): Promise<TraverseResponse> {
  const params = new URLSearchParams();
  if (options?.direction) params.set("direction", options.direction);
  if (options?.edge_kinds) params.set("edge_kinds", options.edge_kinds);
  if (options?.max_depth !== undefined) params.set("max_depth", String(options.max_depth));
  if (options?.max_nodes !== undefined) params.set("max_nodes", String(options.max_nodes));
  const qs = params.toString();
  return get<TraverseResponse>(
    `/memory/traverse/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`,
  );
}

export async function getMemoryContext(
  query: string,
  repo: string,
  maxTokens?: number,
): Promise<ContextResponse> {
  const params = new URLSearchParams({ query, repo });
  if (maxTokens !== undefined) params.set("max_tokens", String(maxTokens));
  return get<ContextResponse>(`/memory/context?${params.toString()}`);
}

export async function getMemoryStats(repo: string): Promise<StatsResponse> {
  return get<StatsResponse>(`/memory/stats?repo=${encodeURIComponent(repo)}`);
}

export async function getRepos(): Promise<string[]> {
  return get<string[]>("/memory/repos");
}

export interface MemoryConversation {
  id: string;
  title: string;
  repo: string;
  source_type: string;
  source_id: string;
  message_count: number;
  created_at: string;
  meta: string;
}

export async function fetchMemoryConversations(
  repo: string,
  limit = 20,
  offset = 0,
): Promise<{ conversations: MemoryConversation[]; total: number }> {
  const params = new URLSearchParams({
    repo,
    limit: String(limit),
    offset: String(offset),
  });
  return get<{ conversations: MemoryConversation[]; total: number }>(
    `/memory/conversations?${params.toString()}`,
  );
}

export interface TraversalLog {
  id: string;
  repo: string;
  agent: string;
  operation: string;
  start_node: string | null;
  params: Record<string, unknown>;
  steps: Array<{
    node_id: string;
    parent_id: string | null;
    edge_id: string | null;
    edge_kind: string | null;
  }>;
  created_at: string;
}

export interface ExpandResult {
  nodes_created: number;
  edges_created: number;
  nodes: NodeResponse[];
  edges: EdgeResponse[];
}

export async function getTraversalLogs(repo: string, limit = 20): Promise<TraversalLog[]> {
  const params = new URLSearchParams({ repo, limit: String(limit) });
  return get<TraversalLog[]>(`/memory/traversals?${params.toString()}`);
}

export async function getTraversalLog(id: string): Promise<TraversalLog> {
  return get<TraversalLog>(`/memory/traversals/${encodeURIComponent(id)}`);
}

export async function expandNode(id: string): Promise<ExpandResult> {
  const res = await fetch(`${API_BASE}/memory/node/${encodeURIComponent(id)}/expand`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (json && typeof json === "object" && "ok" in json) {
    if (!json.ok) throw new Error(json.error?.message ?? "Unknown error");
    return json.data as ExpandResult;
  }
  return json as ExpandResult;
}
