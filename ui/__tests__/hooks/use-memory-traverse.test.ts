import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMemoryTraverse } from "@/hooks/use-memory-traverse";

vi.mock("@/lib/memory-api", () => ({
  traverseMemory: vi.fn(),
}));

import { traverseMemory } from "@/lib/memory-api";
const mockTraverse = vi.mocked(traverseMemory);

beforeEach(() => {
  mockTraverse.mockReset();
});

describe("useMemoryTraverse", () => {
  it("initializes with null state", () => {
    const { result } = renderHook(() => useMemoryTraverse());
    expect(result.current.selectedNode).toBeNull();
    expect(result.current.traverse).toBeNull();
    expect(result.current.traverseLoading).toBe(false);
  });

  it("selects a node and fetches traversal", async () => {
    const mockResult = { root: "n1", nodes: [], edges: [] };
    mockTraverse.mockResolvedValueOnce(mockResult);

    const node = { node_id: "n1", kind: "topic", title: "T", body: "B", score: 1.0, match_type: "keyword" as const };
    const { result } = renderHook(() => useMemoryTraverse());

    await act(async () => result.current.selectNode(node));

    expect(result.current.selectedNode).toEqual(node);
    expect(result.current.traverse).toEqual(mockResult);
    expect(result.current.traverseLoading).toBe(false);
  });

  it("handles traversal error silently", async () => {
    mockTraverse.mockRejectedValueOnce(new Error("fail"));

    const node = { node_id: "n1", kind: "topic", title: "T", body: "B", score: 1.0, match_type: "keyword" as const };
    const { result } = renderHook(() => useMemoryTraverse());

    await act(async () => result.current.selectNode(node));

    expect(result.current.traverse).toBeNull();
    expect(result.current.traverseLoading).toBe(false);
  });

  it("clears node state", async () => {
    const mockResult = { root: "n1", nodes: [], edges: [] };
    mockTraverse.mockResolvedValueOnce(mockResult);

    const node = { node_id: "n1", kind: "topic", title: "T", body: "B", score: 1.0, match_type: "keyword" as const };
    const { result } = renderHook(() => useMemoryTraverse());

    await act(async () => result.current.selectNode(node));
    act(() => result.current.clearNode());

    expect(result.current.selectedNode).toBeNull();
    expect(result.current.traverse).toBeNull();
  });
});
