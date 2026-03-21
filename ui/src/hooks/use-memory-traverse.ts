"use client";

import { useCallback, useState } from "react";
import { traverseMemory, type SearchResult, type TraverseResponse } from "@/lib/memory-api";

export interface UseMemoryTraverseReturn {
  selectedNode: SearchResult | null;
  traverse: TraverseResponse | null;
  traverseLoading: boolean;
  selectNode: (result: SearchResult) => Promise<void>;
  clearNode: () => void;
}

export function useMemoryTraverse(): UseMemoryTraverseReturn {
  const [selectedNode, setSelectedNode] = useState<SearchResult | null>(null);
  const [traverse, setTraverse] = useState<TraverseResponse | null>(null);
  const [traverseLoading, setTraverseLoading] = useState(false);

  const selectNode = useCallback(async (result: SearchResult) => {
    setSelectedNode(result);
    setTraverse(null);
    setTraverseLoading(true);
    try {
      const trav = await traverseMemory(result.node_id, { max_depth: 2, max_nodes: 30 });
      setTraverse(trav);
    } catch {
      setTraverse(null);
    } finally {
      setTraverseLoading(false);
    }
  }, []);

  const clearNode = useCallback(() => {
    setSelectedNode(null);
    setTraverse(null);
  }, []);

  return {
    selectedNode,
    traverse,
    traverseLoading,
    selectNode,
    clearNode,
  };
}
