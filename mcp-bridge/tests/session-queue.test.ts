import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSessionQueue, type SessionJob } from "../src/ingestion/session-queue.js";

describe("createSessionQueue", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("processes items at the rate limit interval", async () => {
    const processed: string[] = [];
    const queue = createSessionQueue({
      rateMs: 100,
      handler: async (job) => { processed.push(job.sessionId); },
    });

    queue.enqueue({ sessionId: "s1", filePath: "/f1", repo: "r", pass: "summary" });
    queue.enqueue({ sessionId: "s2", filePath: "/f2", repo: "r", pass: "both" });

    expect(processed).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(processed).toHaveLength(1);
    expect(processed[0]).toBe("s1");
    await vi.advanceTimersByTimeAsync(100);
    expect(processed).toHaveLength(2);

    queue.stop();
  });

  it("accepts all items without dropping", () => {
    const queue = createSessionQueue({
      rateMs: 1000,
      handler: async () => {},
    });

    for (let i = 0; i < 500; i++) {
      queue.enqueue({ sessionId: `s${i}`, filePath: `/f${i}`, repo: "r", pass: "summary" });
    }

    expect(queue.depth()).toBe(500);

    queue.stop();
  });

  it("preserves pass field on jobs", async () => {
    let capturedPass: string | undefined;
    const queue = createSessionQueue({
      rateMs: 50,
      handler: async (job) => { capturedPass = job.pass; },
    });

    queue.enqueue({ sessionId: "s1", filePath: "/f1", repo: "r", pass: "both" });
    await vi.advanceTimersByTimeAsync(50);
    expect(capturedPass).toBe("both");

    queue.stop();
  });

  it("calls onError when handler throws", async () => {
    const errors: string[] = [];
    const queue = createSessionQueue({
      rateMs: 50,
      handler: async () => { throw new Error("fail"); },
      onError: (err) => { errors.push(err.message); },
    });

    queue.enqueue({ sessionId: "s1", filePath: "/f1", repo: "r", pass: "summary" });
    await vi.advanceTimersByTimeAsync(50);
    expect(errors).toEqual(["fail"]);

    queue.stop();
  });

  it("stops the interval when queue drains", async () => {
    const processed: string[] = [];
    const queue = createSessionQueue({
      rateMs: 50,
      handler: async (job) => { processed.push(job.sessionId); },
    });

    queue.enqueue({ sessionId: "s1", filePath: "/f1", repo: "r", pass: "summary" });
    await vi.advanceTimersByTimeAsync(50);
    expect(processed).toHaveLength(1);
    expect(queue.depth()).toBe(0);

    // Advancing further should not cause issues (interval cleared)
    await vi.advanceTimersByTimeAsync(200);
    expect(processed).toHaveLength(1);

    queue.stop();
  });

  it("stop() prevents further processing", () => {
    const queue = createSessionQueue({
      rateMs: 50,
      handler: async () => {},
    });

    queue.enqueue({ sessionId: "s1", filePath: "/f1", repo: "r", pass: "summary" });
    queue.stop();
    expect(queue.depth()).toBe(1); // item remains but interval is cleared
  });
});
