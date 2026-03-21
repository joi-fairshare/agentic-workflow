"use client";

import { useCallback, useEffect, useState } from "react";
import { getMemoryStats, type StatsResponse } from "@/lib/memory-api";
import { MemoryGraph } from "@/components/memory-graph";
import { useMemorySearch } from "@/hooks/use-memory-search";
import { useMemoryTraverse } from "@/hooks/use-memory-traverse";
import { useContextAssembler } from "@/hooks/use-context-assembler";

const SEARCH_MODES = [
  { value: "hybrid", label: "Hybrid" },
  { value: "keyword", label: "Keyword" },
  { value: "semantic", label: "Semantic" },
];

const KIND_OPTIONS = [
  "message",
  "conversation",
  "topic",
  "decision",
  "artifact",
  "task",
];

const MATCH_TYPE_COLORS: Record<string, string> = {
  keyword: "bg-info-dim text-info border-info-border",
  semantic: "bg-accent-dim text-accent border-accent-border",
  hybrid: "bg-success-dim text-success border-success-border",
};

function getRepo(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("repo") ?? "";
}

export default function MemoryExplorerPage() {
  const [repo, setRepo] = useState("");
  const [stats, setStats] = useState<StatsResponse | null>(null);

  const search = useMemorySearch(repo);
  const traverse = useMemoryTraverse();
  const contextAssembler = useContextAssembler();

  // Merge errors from search and context assembler for display
  const error = search.error ?? contextAssembler.error;

  // Load repo from URL on mount
  useEffect(() => {
    setRepo(getRepo());
  }, []);

  // Load stats when repo changes
  useEffect(() => {
    if (!repo) return;
    getMemoryStats(repo)
      .then(setStats)
      .catch(() => setStats(null));
  }, [repo]);

  const handleSearch = useCallback(async () => {
    traverse.clearNode();
    contextAssembler.clearContext();
    await search.search();
  }, [search, traverse, contextAssembler]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleSearch();
    },
    [handleSearch],
  );

  const handleAssembleContext = useCallback(() => {
    return contextAssembler.assembleContext(search.query, repo);
  }, [contextAssembler, search.query, repo]);

  return (
    <div className="max-w-[1440px] mx-auto px-[var(--s3)] py-[var(--s8)]">
      {/* Page header */}
      <div className="flex items-center justify-between mb-[var(--s6)]">
        <div className="flex items-center gap-[var(--s3)]">
          <div className="w-10 h-10 bg-accent-dim border border-accent-border rounded-sm flex items-center justify-center">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-accent">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">Memory Explorer</h1>
            {stats && (
              <div className="flex items-center gap-[var(--s2)] text-xs text-text-secondary mt-0.5">
                <span>{stats.node_count.toLocaleString()} nodes</span>
                <span className="w-1 h-1 rounded-full bg-text-tertiary" />
                <span>{stats.edge_count.toLocaleString()} edges</span>
              </div>
            )}
          </div>
        </div>

        {/* Repo input */}
        <div className="flex items-center gap-[var(--s2)]">
          <label htmlFor="repo-input" className="text-xs text-text-secondary shrink-0">Repo</label>
          <input
            id="repo-input"
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="e.g. my-repo"
            className="w-48 px-[var(--s3)] py-[var(--s2)] bg-surface border border-border rounded-sm text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-border focus:shadow-[0_0_0_2px_var(--color-accent-dim)]"
          />
        </div>
      </div>

      {/* Search panel */}
      <div className="flex flex-col gap-[var(--s3)] mb-[var(--s6)] p-[var(--s4)] bg-surface border border-border rounded-sm">
        {/* Search bar row */}
        <div className="flex items-center gap-[var(--s3)]">
          <div className="relative flex-1">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-[var(--s3)] top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              aria-label="Search memory"
              placeholder="Search memory nodes..."
              value={search.query}
              onChange={(e) => search.setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full pl-10 pr-[var(--s4)] py-[var(--s3)] bg-bg border border-border rounded-sm text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-border focus:shadow-[0_0_0_2px_var(--color-accent-dim)]"
            />
          </div>

          {/* Mode selector */}
          <select
            value={search.mode}
            onChange={(e) => search.setMode(e.target.value)}
            aria-label="Search mode"
            className="px-[var(--s3)] py-[var(--s3)] bg-bg border border-border rounded-sm text-sm text-text-primary focus:outline-none focus:border-accent-border appearance-none cursor-pointer"
          >
            {SEARCH_MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          <button
            onClick={handleSearch}
            disabled={search.loading || !search.query.trim()}
            className="px-[var(--s5)] py-[var(--s3)] bg-accent-dim border border-accent-border text-accent text-sm font-semibold rounded-sm hover:bg-accent hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {search.loading ? "Searching..." : "Search"}
          </button>
        </div>

        {/* Kind filter chips */}
        <div className="flex items-center gap-[var(--s2)] flex-wrap">
          <span className="text-xs text-text-tertiary shrink-0">Filter by kind:</span>
          {KIND_OPTIONS.map((kind) => (
            <button
              key={kind}
              onClick={() => search.toggleKind(kind)}
              className={`px-[var(--s2)] py-0.5 text-xs font-medium rounded-full border transition-all ${
                search.selectedKinds.includes(kind)
                  ? "bg-accent-dim text-accent border-accent-border"
                  : "bg-transparent text-text-secondary border-border hover:border-[rgba(255,255,255,0.12)]"
              }`}
            >
              {kind}
            </button>
          ))}
          {search.selectedKinds.length > 0 && (
            <button
              onClick={search.clearKinds}
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-[var(--s4)] px-[var(--s4)] py-[var(--s3)] bg-error-dim border border-error-border rounded-sm text-sm text-error">
          {error}
        </div>
      )}

      {/* Main content — results + graph */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-[var(--s6)] items-start">
        {/* Result cards */}
        <div className="flex flex-col gap-[var(--s3)]">
          <div className="flex items-center gap-[var(--s2)] mb-[var(--s1)]">
            <span className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Results</span>
            {search.results.length > 0 && (
              <span className="text-xs font-semibold text-accent bg-accent-dim border border-accent-border px-[var(--s2)] py-0.5 rounded-full">
                {search.results.length}
              </span>
            )}
          </div>

          {search.results.length === 0 && !search.loading && (
            <div className="flex flex-col items-center justify-center py-[var(--s12)] text-center">
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 text-text-tertiary mb-[var(--s4)]">
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              </svg>
              <div className="text-sm font-medium text-text-secondary">No results yet</div>
              <div className="text-xs text-text-tertiary mt-[var(--s1)]">Enter a query and search</div>
            </div>
          )}

          <div className="flex flex-col gap-[var(--s2)] max-h-[calc(100vh-340px)] overflow-y-auto timeline-scroll pr-[var(--s1)]">
            {search.results.map((result) => (
              <button
                key={result.node_id}
                onClick={() => traverse.selectNode(result)}
                className={`w-full text-left p-[var(--s4)] border rounded-sm transition-all cursor-pointer ${
                  traverse.selectedNode?.node_id === result.node_id
                    ? "bg-accent-dim border-accent-border shadow-[0_0_0_1px_var(--color-accent-border)]"
                    : "bg-surface border-border hover:border-[rgba(255,255,255,0.12)] hover:bg-surface-raised"
                }`}
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-[var(--s2)] mb-[var(--s2)]">
                  <div className="text-sm font-semibold text-text-primary leading-tight line-clamp-2 flex-1">
                    {result.title}
                  </div>
                  <span className={`shrink-0 px-[var(--s2)] py-0.5 text-xs font-semibold rounded-full border ${MATCH_TYPE_COLORS[result.match_type] ?? "bg-surface border-border text-text-secondary"}`}>
                    {result.match_type}
                  </span>
                </div>

                {/* Body preview */}
                <p className="text-xs text-text-secondary leading-relaxed line-clamp-3 mb-[var(--s3)]">
                  {result.body}
                </p>

                {/* Footer */}
                <div className="flex items-center gap-[var(--s2)]">
                  <span className="text-xs font-medium text-text-tertiary bg-surface-raised px-[var(--s2)] py-0.5 rounded-xs border border-border">
                    {result.kind}
                  </span>
                  <span className="text-xs text-text-tertiary ml-auto">
                    score {result.score.toFixed(3)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Graph + context panel */}
        <div className="flex flex-col gap-[var(--s6)] sticky top-20">
          {/* Graph view */}
          <div className="bg-surface border border-border rounded-sm overflow-hidden">
            <div className="px-[var(--s4)] py-[var(--s3)] border-b border-border flex items-center gap-[var(--s2)]">
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-accent">
                <circle cx="18" cy="5" r="3"/>
                <circle cx="6" cy="12" r="3"/>
                <circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              <span className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                Relationships
              </span>
              {traverse.selectedNode && (
                <span className="text-xs text-text-tertiary ml-auto font-mono truncate max-w-[200px]">
                  {traverse.selectedNode.title}
                </span>
              )}
            </div>
            <div className="p-[var(--s4)] min-h-[280px]">
              {!traverse.selectedNode && !traverse.traverseLoading && (
                <div className="flex flex-col items-center justify-center h-[240px] text-center">
                  <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 text-text-tertiary mb-[var(--s3)]">
                    <circle cx="18" cy="5" r="3"/>
                    <circle cx="6" cy="12" r="3"/>
                    <circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                  <div className="text-sm text-text-tertiary">Select a result to explore relationships</div>
                </div>
              )}
              {traverse.traverseLoading && (
                <div className="flex items-center justify-center h-[240px] text-text-tertiary text-sm">
                  Loading graph...
                </div>
              )}
              {!traverse.traverseLoading && traverse.traverse && (
                <MemoryGraph
                  nodes={traverse.traverse.nodes}
                  edges={traverse.traverse.edges}
                  className="w-full"
                />
              )}
            </div>
          </div>

          {/* Context assembler */}
          <div className="bg-surface border border-border rounded-sm overflow-hidden">
            <div className="px-[var(--s4)] py-[var(--s3)] border-b border-border flex items-center justify-between gap-[var(--s2)]">
              <div className="flex items-center gap-[var(--s2)]">
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-success">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                <span className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                  Context Builder
                </span>
              </div>
              <button
                onClick={handleAssembleContext}
                disabled={contextAssembler.contextLoading || !search.query.trim()}
                className="px-[var(--s3)] py-[var(--s2)] text-xs font-semibold bg-success-dim border border-success-border text-success rounded-sm hover:bg-success hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {contextAssembler.contextLoading ? "Assembling..." : "Assemble Context"}
              </button>
            </div>

            <div className="p-[var(--s4)]">
              {!contextAssembler.context && !contextAssembler.contextLoading && (
                <div className="flex flex-col items-center justify-center py-[var(--s8)] text-center">
                  <div className="text-sm text-text-tertiary">
                    Enter a query and click <span className="text-text-secondary font-medium">Assemble Context</span> to build a context window
                  </div>
                </div>
              )}
              {contextAssembler.contextLoading && (
                <div className="flex items-center justify-center py-[var(--s8)] text-text-tertiary text-sm">
                  Assembling context...
                </div>
              )}
              {contextAssembler.context && (
                <div className="flex flex-col gap-[var(--s4)]">
                  {/* Summary + token estimate */}
                  <div className="flex items-start justify-between gap-[var(--s3)]">
                    <p className="text-sm text-text-primary leading-relaxed flex-1">{contextAssembler.context.summary}</p>
                    <span className="shrink-0 text-xs font-semibold text-success bg-success-dim border border-success-border px-[var(--s2)] py-0.5 rounded-full whitespace-nowrap">
                      ~{contextAssembler.context.token_estimate.toLocaleString()} tokens
                    </span>
                  </div>

                  {/* Sections */}
                  {contextAssembler.context.sections.length > 0 && (
                    <div className="flex flex-col gap-[var(--s3)]">
                      {contextAssembler.context.sections.map((section, i) => (
                        <div key={i} className="border border-border rounded-xs overflow-hidden">
                          <div className="flex items-center justify-between px-[var(--s3)] py-[var(--s2)] bg-surface-raised border-b border-border">
                            <span className="text-xs font-semibold text-text-primary">{section.heading}</span>
                            <span className="text-xs text-text-tertiary">relevance {section.relevance.toFixed(2)}</span>
                          </div>
                          <div className="px-[var(--s3)] py-[var(--s3)]">
                            <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap font-mono">
                              {section.content}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
