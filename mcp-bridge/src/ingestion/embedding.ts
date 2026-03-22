// mcp-bridge/src/ingestion/embedding.ts
import type { AppResult } from "../application/result.js";
import { ok, err } from "../application/result.js";

// ── Constants ────────────────────────────────────────────────

export const EMBEDDING_DIMS = 768;
/** P1: Max characters to embed (rough proxy for 8192 tokens). */
const DEFAULT_MAX_CHARS = 32_000;
const BATCH_SIZE = 32;

// ── Types ────────────────────────────────────────────────────

export interface EmbedFn {
  (texts: string[]): Promise<Float32Array[]>;
}

export interface EmbeddingServiceOptions {
  embedFn?: EmbedFn;
  maxChars?: number;
}

export interface EmbeddingService {
  embed(text: string): Promise<AppResult<Float32Array>>;
  embedBatch(texts: string[]): Promise<AppResult<Float32Array[]>>;
  isReady(): boolean;
  isDegraded(): boolean;
  /** Trigger lazy model loading at startup so the first real request is not delayed. */
  warmUp(): Promise<void>;
}

// ── Default nomic embed function (lazy-loaded) ───────────────

async function createNomicEmbedFn(): Promise<EmbedFn> {
  const { pipeline } = await import("@huggingface/transformers");
  const extractor = await pipeline(
    "feature-extraction",
    "nomic-ai/nomic-embed-text-v1.5",
    // "q8" is a valid quantization dtype supported at runtime but absent from
    // HuggingFace Transformers' published TypeScript type definitions. The cast
    // to `never` silences the type error without widening to `any`.
    { dtype: "q8" as never },
  );

  // Note: callers must add the appropriate nomic prefix BEFORE calling embedFn:
  //   "search_document: " for documents being indexed
  //   "search_query: " for search queries
  // The embedFn itself does NOT add any prefix.
  return async (texts: string[]) => {
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    if (!(output.data instanceof Float32Array)) {
      throw new Error(
        `Unexpected embedding output type: expected Float32Array, got ${Object.prototype.toString.call(output.data)}`,
      );
    }
    const flat = output.data;
    const dim = EMBEDDING_DIMS;
    return texts.map((_, i) => flat.slice(i * dim, (i + 1) * dim));
  };
}

// ── Factory ──────────────────────────────────────────────────

export function createEmbeddingService(options: EmbeddingServiceOptions = {}): EmbeddingService {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  let embedFn: EmbedFn | null = options.embedFn ?? null;
  let ready = false;
  let degraded = false;
  let initPromise: Promise<void> | null = null;

  function truncate(text: string): string {
    return text.length > maxChars ? text.slice(0, maxChars) : text;
  }

  async function ensureReady(): Promise<AppResult<void>> {
    if (ready) return ok(undefined);
    if (degraded) return err({ code: "EMBEDDING_DEGRADED", message: "Embedding model failed to load", statusHint: 503 });

    if (!embedFn) {
      if (!initPromise) {
        initPromise = createNomicEmbedFn()
          .then((fn) => { embedFn = fn; ready = true; })
          .catch(() => { degraded = true; });
      }
      await initPromise;
      if (degraded) return err({ code: "EMBEDDING_DEGRADED", message: "Embedding model failed to load", statusHint: 503 });
    }

    ready = true;
    return ok(undefined);
  }

  return {
    async embed(text) {
      const initResult = await ensureReady();
      if (!initResult.ok) return err(initResult.error);

      try {
        const results = await embedFn!([truncate(text)]);
        return ok(results[0]);
      } catch (e) {
        return err({
          code: "EMBEDDING_FAILED",
          message: e instanceof Error ? e.message : "Embedding failed",
          statusHint: 500,
        });
      }
    },

    async embedBatch(texts) {
      const initResult = await ensureReady();
      if (!initResult.ok) return err(initResult.error);

      try {
        const truncated = texts.map(truncate);
        const allResults: Float32Array[] = [];

        for (let i = 0; i < truncated.length; i += BATCH_SIZE) {
          const batch = truncated.slice(i, i + BATCH_SIZE);
          const results = await embedFn!(batch);
          allResults.push(...results);
        }

        return ok(allResults);
      } catch (e) {
        return err({
          code: "EMBEDDING_FAILED",
          message: e instanceof Error ? e.message : "Batch embedding failed",
          statusHint: 500,
        });
      }
    },

    isReady: () => ready,
    isDegraded: () => degraded,

    async warmUp() {
      // Discard the result — the goal is to trigger lazy model loading so that
      // the first real request does not incur multi-second model-download latency.
      await ensureReady();
    },
  };
}
