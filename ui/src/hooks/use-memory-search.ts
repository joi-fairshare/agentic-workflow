"use client";

import { useCallback, useState } from "react";
import { searchMemory, type SearchResult } from "@/lib/memory-api";

export interface UseMemorySearchReturn {
  query: string;
  mode: string;
  selectedKinds: string[];
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  setQuery: (query: string) => void;
  setMode: (mode: string) => void;
  toggleKind: (kind: string) => void;
  clearKinds: () => void;
  search: () => Promise<void>;
  clearResults: () => void;
}

export function useMemorySearch(repo: string): UseMemorySearchReturn {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("hybrid");
  const [selectedKinds, setSelectedKinds] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await searchMemory(
        query.trim(),
        repo,
        mode,
        selectedKinds.length > 0 ? selectedKinds : undefined,
      );
      setResults(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, repo, mode, selectedKinds]);

  const toggleKind = useCallback((kind: string) => {
    setSelectedKinds((prev: string[]) =>
      prev.includes(kind) ? prev.filter((k: string) => k !== kind) : [...prev, kind],
    );
  }, []);

  const clearKinds = useCallback(() => {
    setSelectedKinds([]);
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return {
    query,
    mode,
    selectedKinds,
    results,
    loading,
    error,
    setQuery,
    setMode,
    toggleKind,
    clearKinds,
    search,
    clearResults,
  };
}
