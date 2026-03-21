// mcp-bridge/tests/queue.test.ts
import { describe, it, expect, vi } from "vitest";
import { createBoundedQueue, type BoundedQueue } from "../src/ingestion/queue.js";

describe("createBoundedQueue", () => {
  it("processes items through the handler", async () => {
    const processed: string[] = [];
    const queue = createBoundedQueue<string>({
      maxSize: 10,
      handler: async (item) => { processed.push(item); },
    });

    queue.enqueue("a");
    queue.enqueue("b");

    await new Promise((r) => setTimeout(r, 50));

    expect(processed).toEqual(["a", "b"]);
    queue.stop();
  });

  it("drops oldest non-critical items on overflow", async () => {
    const processed: string[] = [];
    const dropped: string[] = [];
    const queue = createBoundedQueue<string>({
      maxSize: 3,
      handler: async (item) => {
        await new Promise((r) => setTimeout(r, 100));
        processed.push(item);
      },
      onDrop: (item) => dropped.push(item),
    });

    for (let i = 0; i < 6; i++) queue.enqueue(`item-${i}`);

    await new Promise((r) => setTimeout(r, 500));
    queue.stop();

    expect(dropped.length).toBeGreaterThan(0);
  });

  it("reports queue depth", () => {
    const queue = createBoundedQueue<string>({
      maxSize: 10,
      handler: async () => { await new Promise((r) => setTimeout(r, 1000)); },
    });

    queue.enqueue("a");
    queue.enqueue("b");
    expect(queue.depth()).toBeGreaterThanOrEqual(1);
    queue.stop();
  });

  it("stops processing after stop() is called", async () => {
    const processed: string[] = [];
    const queue = createBoundedQueue<string>({
      maxSize: 10,
      handler: async (item) => { processed.push(item); },
    });

    queue.stop();
    queue.enqueue("after-stop");

    await new Promise((r) => setTimeout(r, 50));
    expect(processed).not.toContain("after-stop");
  });
});
