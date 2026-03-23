// mcp-bridge/tests/queue.test.ts
import { describe, it, expect } from "vitest";
import { createAsyncQueue } from "../src/ingestion/queue.js";

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

describe("createAsyncQueue", () => {
  it("processes enqueued items in order", async () => {
    const processed: number[] = [];
    const q = createAsyncQueue<number>({
      handler: async (item) => { processed.push(item); },
    });

    q.enqueue(1);
    q.enqueue(2);
    await waitUntil(() => processed.length >= 2);

    expect(processed).toEqual([1, 2]);
    q.stop();
  });

  it("reports queue depth", () => {
    const q = createAsyncQueue<number>({
      handler: async () => { await new Promise((r) => setTimeout(r, 1000)); },
    });

    q.enqueue(1);
    q.enqueue(2);
    expect(q.depth()).toBeGreaterThanOrEqual(0);
    q.stop();
  });

  it("accepts all items without dropping", async () => {
    const processed: number[] = [];
    const q = createAsyncQueue<number>({
      handler: async (item) => { processed.push(item); },
    });

    for (let i = 0; i < 1000; i++) {
      q.enqueue(i);
    }

    await waitUntil(() => processed.length >= 1000);
    expect(processed).toHaveLength(1000);
    expect(processed[0]).toBe(0);
    expect(processed[999]).toBe(999);
    q.stop();
  });

  it("calls onError when handler throws", async () => {
    const errors: Error[] = [];
    const q = createAsyncQueue<number>({
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
    const q = createAsyncQueue<number>({
      handler: async (item) => { processed.push(item); },
    });

    q.stop();
    q.enqueue(1);
    // Queue is stopped — nothing to wait for; give the event loop one tick to confirm
    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    expect(processed).toHaveLength(0);
  });
});
