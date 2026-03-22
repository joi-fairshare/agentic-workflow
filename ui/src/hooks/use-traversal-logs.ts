"use client";
import { useCallback, useState } from "react";
import { getTraversalLogs, type TraversalLog } from "@/lib/memory-api";

export interface UseTraversalLogsReturn {
  logs: TraversalLog[];
  loading: boolean;
  error: string | null;
  fetchLogs: (limit?: number) => Promise<void>;
}

export function useTraversalLogs(repo: string): UseTraversalLogsReturn {
  const [logs, setLogs] = useState<TraversalLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(
    async (limit = 20) => {
      if (!repo) return;
      setLoading(true);
      setError(null);
      try {
        const result = await getTraversalLogs(repo, limit);
        setLogs(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load traversal logs");
        setLogs([]);
      } finally {
        setLoading(false);
      }
    },
    [repo],
  );

  return { logs, loading, error, fetchLogs };
}
