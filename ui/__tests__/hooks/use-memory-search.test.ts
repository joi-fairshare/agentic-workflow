import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMemorySearch } from "@/hooks/use-memory-search";

vi.mock("@/lib/memory-api", () => ({
  searchMemory: vi.fn(),
}));

import { searchMemory } from "@/lib/memory-api";
const mockSearchMemory = vi.mocked(searchMemory);

beforeEach(() => {
  mockSearchMemory.mockReset();
});

describe("useMemorySearch", () => {
  it("initializes with default state", () => {
    const { result } = renderHook(() => useMemorySearch("test-repo"));
    expect(result.current.query).toBe("");
    expect(result.current.mode).toBe("hybrid");
    expect(result.current.selectedKinds).toEqual([]);
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("updates query state", () => {
    const { result } = renderHook(() => useMemorySearch("repo"));
    act(() => result.current.setQuery("test query"));
    expect(result.current.query).toBe("test query");
  });

  it("updates mode state", () => {
    const { result } = renderHook(() => useMemorySearch("repo"));
    act(() => result.current.setMode("keyword"));
    expect(result.current.mode).toBe("keyword");
  });

  it("toggles kind selection", () => {
    const { result } = renderHook(() => useMemorySearch("repo"));
    act(() => result.current.toggleKind("topic"));
    expect(result.current.selectedKinds).toEqual(["topic"]);
    act(() => result.current.toggleKind("topic"));
    expect(result.current.selectedKinds).toEqual([]);
  });

  it("clears kinds", () => {
    const { result } = renderHook(() => useMemorySearch("repo"));
    act(() => result.current.toggleKind("topic"));
    act(() => result.current.clearKinds());
    expect(result.current.selectedKinds).toEqual([]);
  });

  it("does not search with empty query", async () => {
    const { result } = renderHook(() => useMemorySearch("repo"));
    await act(async () => result.current.search());
    expect(mockSearchMemory).not.toHaveBeenCalled();
  });

  it("searches and returns results", async () => {
    const mockResults = [{ node_id: "n1", kind: "topic", title: "T", body: "B", score: 1.0, match_type: "keyword" as const }];
    mockSearchMemory.mockResolvedValueOnce(mockResults);

    const { result } = renderHook(() => useMemorySearch("repo"));
    act(() => result.current.setQuery("test"));
    await act(async () => result.current.search());

    expect(result.current.results).toEqual(mockResults);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("searches with no kinds passes undefined", async () => {
    const mockResults = [{ node_id: "n1", kind: "topic", title: "T", body: "B", score: 1.0, match_type: "keyword" as const }];
    mockSearchMemory.mockResolvedValueOnce(mockResults);

    const { result } = renderHook(() => useMemorySearch("repo"));
    act(() => result.current.setQuery("hello"));
    await act(async () => result.current.search());

    expect(mockSearchMemory).toHaveBeenCalledWith("hello", "repo", "hybrid", undefined);
  });

  it("searches with selected kinds", async () => {
    const mockResults = [{ node_id: "n2", kind: "decision", title: "D", body: "B", score: 0.9, match_type: "semantic" as const }];
    mockSearchMemory.mockResolvedValueOnce(mockResults);

    const { result } = renderHook(() => useMemorySearch("repo"));
    act(() => result.current.setQuery("test"));
    act(() => result.current.toggleKind("decision"));
    await act(async () => result.current.search());

    expect(mockSearchMemory).toHaveBeenCalledWith("test", "repo", "hybrid", ["decision"]);
    expect(result.current.results).toEqual(mockResults);
  });

  it("handles search error", async () => {
    mockSearchMemory.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useMemorySearch("repo"));
    act(() => result.current.setQuery("test"));
    await act(async () => result.current.search());

    expect(result.current.results).toEqual([]);
    expect(result.current.error).toBe("Network error");
  });

  it("handles non-Error exception", async () => {
    mockSearchMemory.mockRejectedValueOnce("string error");

    const { result } = renderHook(() => useMemorySearch("repo"));
    act(() => result.current.setQuery("test"));
    await act(async () => result.current.search());

    expect(result.current.error).toBe("Search failed");
  });

  it("clears results", async () => {
    mockSearchMemory.mockResolvedValueOnce([{ node_id: "n1", kind: "topic", title: "T", body: "B", score: 1.0, match_type: "keyword" as const }]);

    const { result } = renderHook(() => useMemorySearch("repo"));
    act(() => result.current.setQuery("test"));
    await act(async () => result.current.search());
    act(() => result.current.clearResults());

    expect(result.current.results).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
