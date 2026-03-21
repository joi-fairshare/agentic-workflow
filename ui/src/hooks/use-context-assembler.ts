"use client";

import { useCallback, useState } from "react";
import { getMemoryContext, type ContextResponse } from "@/lib/memory-api";

const DEFAULT_TOKEN_BUDGET = 4000;

export interface UseContextAssemblerReturn {
  context: ContextResponse | null;
  contextLoading: boolean;
  tokenBudget: number;
  setTokenBudget: (budget: number) => void;
  assembleContext: (query: string, repo: string) => Promise<void>;
  clearContext: () => void;
  error: string | null;
}

export function useContextAssembler(): UseContextAssemblerReturn {
  const [context, setContext] = useState<ContextResponse | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [tokenBudget, setTokenBudget] = useState(DEFAULT_TOKEN_BUDGET);
  const [error, setError] = useState<string | null>(null);

  const assembleContext = useCallback(
    async (query: string, repo: string) => {
      if (!query.trim()) return;
      setContextLoading(true);
      setContext(null);
      setError(null);
      try {
        const ctx = await getMemoryContext(query.trim(), repo, tokenBudget);
        setContext(ctx);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Context assembly failed");
      } finally {
        setContextLoading(false);
      }
    },
    [tokenBudget],
  );

  const clearContext = useCallback(() => {
    setContext(null);
    setError(null);
  }, []);

  return {
    context,
    contextLoading,
    tokenBudget,
    setTokenBudget,
    assembleContext,
    clearContext,
    error,
  };
}
