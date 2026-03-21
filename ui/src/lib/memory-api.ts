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
