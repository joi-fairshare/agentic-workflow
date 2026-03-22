import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useContextAssembler } from "@/hooks/use-context-assembler";

vi.mock("@/lib/memory-api", () => ({
  getMemoryContext: vi.fn(),
}));

import { getMemoryContext } from "@/lib/memory-api";
const mockGetContext = vi.mocked(getMemoryContext);

beforeEach(() => {
  mockGetContext.mockReset();
});

describe("useContextAssembler", () => {
  it("initializes with default state", () => {
    const { result } = renderHook(() => useContextAssembler());
    expect(result.current.context).toBeNull();
    expect(result.current.contextLoading).toBe(false);
    expect(result.current.tokenBudget).toBe(4000);
    expect(result.current.error).toBeNull();
  });

  it("assembles context for a query", async () => {
    const mockCtx = { summary: "test", sections: [], token_estimate: 100 };
    mockGetContext.mockResolvedValueOnce(mockCtx);

    const { result } = renderHook(() => useContextAssembler());
    await act(async () => result.current.assembleContext("test query", "repo"));

    expect(result.current.context).toEqual(mockCtx);
    expect(result.current.contextLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("skips empty query", async () => {
    const { result } = renderHook(() => useContextAssembler());
    await act(async () => result.current.assembleContext("   ", "repo"));
    expect(mockGetContext).not.toHaveBeenCalled();
  });

  it("handles error", async () => {
    mockGetContext.mockRejectedValueOnce(new Error("Context fail"));

    const { result } = renderHook(() => useContextAssembler());
    await act(async () => result.current.assembleContext("test", "repo"));

    expect(result.current.error).toBe("Context fail");
    expect(result.current.context).toBeNull();
  });

  it("handles non-Error exception", async () => {
    mockGetContext.mockRejectedValueOnce("string error");

    const { result } = renderHook(() => useContextAssembler());
    await act(async () => result.current.assembleContext("test", "repo"));

    expect(result.current.error).toBe("Context assembly failed");
  });

  it("updates token budget", () => {
    const { result } = renderHook(() => useContextAssembler());
    act(() => result.current.setTokenBudget(8000));
    expect(result.current.tokenBudget).toBe(8000);
  });

  it("clears context", async () => {
    const mockCtx = { summary: "test", sections: [], token_estimate: 100 };
    mockGetContext.mockResolvedValueOnce(mockCtx);

    const { result } = renderHook(() => useContextAssembler());
    await act(async () => result.current.assembleContext("test", "repo"));
    act(() => result.current.clearContext());

    expect(result.current.context).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
