import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSse } from "@/hooks/use-sse";
import { MockEventSource } from "../setup";

beforeEach(() => {
  MockEventSource.instances = [];
});

describe("useSse", () => {
  it("creates an EventSource on mount", () => {
    const onEvent = vi.fn();
    renderHook(() => useSse({ onEvent }));
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe("/api/events");
  });

  it("registers listeners for all event types", () => {
    const onEvent = vi.fn();
    renderHook(() => useSse({ onEvent }));
    const es = MockEventSource.instances[0];
    expect(es.listeners["connected"]).toHaveLength(1);
    expect(es.listeners["message:created"]).toHaveLength(1);
    expect(es.listeners["task:created"]).toHaveLength(1);
    expect(es.listeners["task:updated"]).toHaveLength(1);
  });

  it("calls onEvent when an event is received", () => {
    const onEvent = vi.fn();
    renderHook(() => useSse({ onEvent }));
    const es = MockEventSource.instances[0];
    es._emit("message:created", { id: "m1", conversation: "c1" });
    expect(onEvent).toHaveBeenCalledWith("message:created", { id: "m1", conversation: "c1" });
  });

  it("calls onEvent with empty object on JSON parse error", () => {
    const onEvent = vi.fn();
    renderHook(() => useSse({ onEvent }));
    const es = MockEventSource.instances[0];
    for (const listener of es.listeners["connected"]) {
      listener(new MessageEvent("connected", { data: "not-json" }));
    }
    expect(onEvent).toHaveBeenCalledWith("connected", {});
  });

  it("closes EventSource on unmount", () => {
    const onEvent = vi.fn();
    const closeSpy = vi.spyOn(MockEventSource.prototype, "close");
    const { unmount } = renderHook(() => useSse({ onEvent }));
    unmount();
    expect(closeSpy).toHaveBeenCalled();
    closeSpy.mockRestore();
  });

  it("onerror handler is a no-op (EventSource auto-reconnects)", () => {
    const onEvent = vi.fn();
    renderHook(() => useSse({ onEvent }));
    const es = MockEventSource.instances[0];
    // The hook assigns onerror to the EventSource instance — call it to exercise the body
    expect(es.onerror).toBeTypeOf("function");
    expect(() => (es.onerror as () => void)()).not.toThrow();
  });
});
