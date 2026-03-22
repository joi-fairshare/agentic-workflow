import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchConversations, fetchMessages, fetchTasks } from "@/lib/api";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockOkResponse(data: unknown) {
  return { ok: true, status: 200, statusText: "OK", json: async () => ({ ok: true, data }) };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("fetchConversations", () => {
  it("fetches conversations with default pagination", async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ conversations: [], total: 0 }));
    const result = await fetchConversations();
    expect(result).toEqual({ conversations: [], total: 0 });
    expect(mockFetch).toHaveBeenCalledWith("/api/conversations?limit=20&offset=0");
  });

  it("passes custom limit and offset", async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ conversations: [], total: 0 }));
    await fetchConversations(10, 5);
    expect(mockFetch).toHaveBeenCalledWith("/api/conversations?limit=10&offset=5");
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Server Error", json: async () => ({}) });
    await expect(fetchConversations()).rejects.toThrow("API 500");
  });

  it("throws on API error envelope", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, statusText: "OK",
      json: async () => ({ ok: false, error: { code: "ERR", message: "Something failed" } }),
    });
    await expect(fetchConversations()).rejects.toThrow("Something failed");
  });
});

describe("fetchMessages", () => {
  it("fetches messages for a conversation", async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse([]));
    const result = await fetchMessages("conv-1");
    expect(result).toEqual([]);
    expect(mockFetch).toHaveBeenCalledWith("/api/messages/conversation/conv-1");
  });
});

describe("fetchTasks", () => {
  it("fetches tasks for a conversation", async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse([]));
    const result = await fetchTasks("conv-1");
    expect(result).toEqual([]);
    expect(mockFetch).toHaveBeenCalledWith("/api/tasks/conversation/conv-1");
  });
});
