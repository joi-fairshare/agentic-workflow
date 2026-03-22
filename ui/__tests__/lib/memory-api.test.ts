import { describe, it, expect, beforeEach, vi } from "vitest";
import { searchMemory, getMemoryNode, getMemoryNodeEdges, traverseMemory, getMemoryContext, getMemoryStats } from "@/lib/memory-api";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const API_BASE = "http://localhost:3100";

function mockOkResponse(data: unknown) {
  return { ok: true, status: 200, statusText: "OK", json: async () => ({ ok: true, data }) };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("searchMemory", () => {
  it("builds correct URL with required params", async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse([]));
    await searchMemory("test query", "my-repo");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/memory/search?");
    expect(url).toContain("query=test+query");
    expect(url).toContain("repo=my-repo");
  });

  it("includes optional mode and kinds", async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse([]));
    await searchMemory("q", "repo", "keyword", ["topic", "decision"]);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("mode=keyword");
    expect(url).toContain("kinds=topic%2Cdecision");
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Error", json: async () => ({}) });
    await expect(searchMemory("q", "repo")).rejects.toThrow("API 500");
  });

  it("throws on API error envelope", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, statusText: "OK",
      json: async () => ({ ok: false, error: { message: "Search failed" } }),
    });
    await expect(searchMemory("q", "repo")).rejects.toThrow("Search failed");
  });

  it("throws Unknown error when envelope has no message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, statusText: "OK",
      json: async () => ({ ok: false, error: null }),
    });
    await expect(searchMemory("q", "repo")).rejects.toThrow("Unknown error");
  });

  it("throws Unknown error when error object has no message property", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, statusText: "OK",
      json: async () => ({ ok: false, error: {} }),
    });
    await expect(searchMemory("q", "repo")).rejects.toThrow("Unknown error");
  });

  it("throws Unknown error when error is undefined", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, statusText: "OK",
      json: async () => ({ ok: false }),
    });
    await expect(searchMemory("q", "repo")).rejects.toThrow("Unknown error");
  });

  it("handles response without ok envelope", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, statusText: "OK",
      json: async () => [{ node_id: "n1" }],
    });
    const result = await searchMemory("q", "repo");
    expect(result).toEqual([{ node_id: "n1" }]);
  });
});

describe("getMemoryNode", () => {
  it("URI-encodes the node id", async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ id: "n1" }));
    await getMemoryNode("node/with/slashes");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("node%2Fwith%2Fslashes");
  });
});

describe("getMemoryNodeEdges", () => {
  it("fetches edges for a node", async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse([]));
    const result = await getMemoryNodeEdges("n1");
    expect(result).toEqual([]);
  });
});

describe("traverseMemory", () => {
  it("builds URL with options", async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ root: "n1", nodes: [], edges: [] }));
    await traverseMemory("n1", { max_depth: 2, max_nodes: 30 });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("max_depth=2");
    expect(url).toContain("max_nodes=30");
  });

  it("works without options (no query string)", async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ root: "n1", nodes: [], edges: [] }));
    await traverseMemory("n1");
    const url = mockFetch.mock.calls[0][0] as string;
    // Should have no query string or empty query string
    const urlObj = new URL(url);
    expect(urlObj.search).toBe("");
  });

  it("includes direction and edge_kinds when provided", async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ root: "n1", nodes: [], edges: [] }));
    await traverseMemory("n1", { direction: "outbound", edge_kinds: "contains,reply_to" });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("direction=outbound");
    expect(url).toContain("edge_kinds=contains%2Creply_to");
  });
});

describe("getMemoryContext", () => {
  it("includes max_tokens when provided", async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ summary: "", sections: [], token_estimate: 0 }));
    await getMemoryContext("q", "repo", 4000);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("max_tokens=4000");
  });

  it("omits max_tokens when not provided", async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ summary: "", sections: [], token_estimate: 0 }));
    await getMemoryContext("q", "repo");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).not.toContain("max_tokens");
  });
});

describe("getMemoryStats", () => {
  it("URI-encodes repo name", async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ node_count: 0, edge_count: 0 }));
    await getMemoryStats("my repo");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("repo=my%20repo");
  });
});
