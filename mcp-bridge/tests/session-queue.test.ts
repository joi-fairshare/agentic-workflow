import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSessionQueue, type SessionJob } from "../src/ingestion/session-queue.js";

describe("createSessionQueue", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("processes items at the rate limit interval", async () => {
    const processed: string[] = [];
    const queue = createSessionQueue({
      maxSize: 10,
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

  it("drops oldest when queue is full and calls onDrop", () => {
    const dropped: string[] = [];
    const queue = createSessionQueue({
      maxSize: 2,
      rateMs: 1000,
      handler: async () => {},
      onDrop: (job) => { dropped.push(job.sessionId); },
    });

    queue.enqueue({ sessionId: "s1", filePath: "/f1", repo: "r", pass: "summary" });
    queue.enqueue({ sessionId: "s2", filePath: "/f2", repo: "r", pass: "summary" });
    queue.enqueue({ sessionId: "s3", filePath: "/f3", repo: "r", pass: "summary" });

    expect(dropped).toEqual(["s1"]);
    expect(queue.depth()).toBe(2);

    queue.stop();
  });

  it("preserves pass field on jobs", async () => {
    let capturedPass: string | undefined;
    const queue = createSessionQueue({
      maxSize: 10,
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
      maxSize: 10,
      rateMs: 50,
      handler: async () => { throw new Error("fail"); },
      onError: (err) => { errors.push(err.message); },
    });

    queue.enqueue({ sessionId: "s1", filePath: "/f1", repo: "r", pass: "summary" });
    await vi.advanceTimersByTimeAsync(50);
    expect(errors).toEqual(["fail"]);

    queue.stop();
  });

  it("stop() clears the interval", () => {
    const queue = createSessionQueue({
      maxSize: 10,
      rateMs: 50,
      handler: async () => {},
    });

    queue.enqueue({ sessionId: "s1", filePath: "/f1", repo: "r", pass: "summary" });
    queue.stop();
    expect(queue.depth()).toBe(1); // item remains but interval is cleared
  });
});
