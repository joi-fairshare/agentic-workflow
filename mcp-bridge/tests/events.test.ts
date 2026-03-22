import { describe, it, expect } from "vitest";
import { createEventBus, type BridgeEvent } from "../src/application/events.js";

describe("createEventBus", () => {
  it("delivers events to subscribers", () => {
    const bus = createEventBus();
    const received: BridgeEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const event: BridgeEvent = {
      type: "message:created",
      data: { id: "abc", conversation: "conv-1" },
    };
    bus.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(event);
  });

  it("delivers to multiple subscribers", () => {
    const bus = createEventBus();
    const a: BridgeEvent[] = [];
    const b: BridgeEvent[] = [];
    bus.subscribe((e) => a.push(e));
    bus.subscribe((e) => b.push(e));

    bus.emit({ type: "task:created", data: { id: "t1", conversation: "c1" } });

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("unsubscribe stops delivery", () => {
    const bus = createEventBus();
    const received: BridgeEvent[] = [];
    const unsub = bus.subscribe((e) => received.push(e));

    unsub();
    bus.emit({ type: "message:created", data: { id: "x", conversation: "y" } });

    expect(received).toHaveLength(0);
  });

  it("does not throw when emitting with no subscribers", () => {
    const bus = createEventBus();
    expect(() => {
      bus.emit({ type: "task:updated", data: { id: "t1", conversation: "c1", status: "completed" } });
    }).not.toThrow();
  });

  it("delivers memory:ingestion_dropped events", () => {
    const bus = createEventBus();
    const received: BridgeEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const event: BridgeEvent = {
      type: "memory:ingestion_dropped",
      data: { reason: "queue full" },
    };
    bus.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(event);
    expect(received[0].type).toBe("memory:ingestion_dropped");
  });
});
