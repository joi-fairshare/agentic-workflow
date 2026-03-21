// mcp-bridge/tests/embedding.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createEmbeddingService, type EmbeddingService } from "../src/ingestion/embedding.js";

describe("createEmbeddingService", () => {
  let service: EmbeddingService;

  beforeEach(() => {
    service = createEmbeddingService({
      embedFn: async (texts: string[]) =>
        texts.map(() => new Float32Array(768).fill(0.1)),
    });
  });

  it("embeds a single text", async () => {
    const result = await service.embed("Hello world");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toBeInstanceOf(Float32Array);
    expect(result.data.length).toBe(768);
  });

  it("embeds a batch of texts", async () => {
    const result = await service.embedBatch(["Hello", "World", "Test"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(3);
    expect(result.data[0]).toBeInstanceOf(Float32Array);
  });

  it("reports ready status after first embed", async () => {
    expect(service.isReady()).toBe(false);
    await service.embed("init");
    expect(service.isReady()).toBe(true);
  });

  it("returns error when embedFn throws", async () => {
    const failService = createEmbeddingService({
      embedFn: async () => { throw new Error("Model load failed"); },
    });

    const result = await failService.embed("test");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("EMBEDDING_FAILED");
  });

  it("enters degraded mode only on init failure, not per-call failure", async () => {
    let callCount = 0;
    const failOnceService = createEmbeddingService({
      embedFn: async (texts) => {
        callCount++;
        if (callCount === 1) throw new Error("transient");
        return texts.map(() => new Float32Array(768).fill(0.1));
      },
    });

    const r1 = await failOnceService.embed("test");
    expect(r1.ok).toBe(false);
    expect(failOnceService.isReady()).toBe(true);
    expect(failOnceService.isDegraded()).toBe(false);
    const r2 = await failOnceService.embed("test2");
    expect(r2.ok).toBe(true);
  });

  it("truncates input to max token estimate before embedding", async () => {
    const captured: string[] = [];
    const capturingService = createEmbeddingService({
      embedFn: async (texts) => {
        captured.push(...texts);
        return texts.map(() => new Float32Array(768).fill(0.1));
      },
      maxChars: 100,
    });

    const longText = "x".repeat(200);
    await capturingService.embed(longText);
    expect(captured[0].length).toBeLessThanOrEqual(100);
  });
});
