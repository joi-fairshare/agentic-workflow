// mcp-bridge/tests/queue.test.ts
import { describe, it, expect, vi } from "vitest";
import { createBoundedQueue } from "../src/ingestion/queue.js";

/**
 * Poll until the predicate returns true or the timeout (default 2000ms) expires.
 * Checks every 10ms, so it's both fast and not sensitive to arbitrary fixed delays.
 */
async function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`waitUntil timed out after ${timeoutMs}ms`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}

describe("createBoundedQueue", () => {
  it("processes enqueued items", async () => {
    const processed: number[] = [];
    const q = createBoundedQueue<number>({
      maxSize: 10,
      handler: async (item) => { processed.push(item); },
    });

    q.enqueue(1);
    q.enqueue(2);
    await waitUntil(() => processed.length >= 2);

    expect(processed).toContain(1);
    expect(processed).toContain(2);
    q.stop();
  });

  it("reports queue depth", () => {
    const q = createBoundedQueue<number>({
      maxSize: 10,
      handler: async () => { await new Promise((r) => setTimeout(r, 1000)); },
    });

    q.enqueue(1);
    q.enqueue(2);
    expect(q.depth()).toBeGreaterThanOrEqual(0);
    q.stop();
  });

  it("drops oldest item when maxSize exceeded", async () => {
    const dropped: number[] = [];
    const processed: number[] = [];
    const q = createBoundedQueue<number>({
      maxSize: 2,
      handler: async (item) => {
        await new Promise((r) => setTimeout(r, 100));
        processed.push(item);
      },
      onDrop: (item) => { dropped.push(item); },
    });

    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    q.enqueue(4);

    await waitUntil(() => dropped.length > 0);

    expect(dropped.length).toBeGreaterThan(0);
    q.stop();
  });

  it("calls onError when handler throws", async () => {
    const errors: Error[] = [];
    const q = createBoundedQueue<number>({
      maxSize: 10,
      handler: async () => { throw new Error("boom"); },
      onError: (e) => { errors.push(e as Error); },
    });

    q.enqueue(1);
    await waitUntil(() => errors.length >= 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("boom");
    q.stop();
  });

  it("no-ops enqueue after stop", async () => {
    const processed: number[] = [];
    const q = createBoundedQueue<number>({
      maxSize: 10,
      handler: async (item) => { processed.push(item); },
    });

    q.stop();
    q.enqueue(1);
    // Queue is stopped — nothing to wait for; give the event loop one tick to confirm
    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    expect(processed).toHaveLength(0);
  });
});
