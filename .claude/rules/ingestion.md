---
globs: ["mcp-bridge/src/ingestion/**", "mcp-bridge/src/application/services/ingest-*.ts", "mcp-bridge/src/application/services/extract-*.ts", "mcp-bridge/src/application/services/infer-*.ts"]
---

# Ingestion Rules

## BoundedQueue<T> — Backpressure-Aware Async Processing

Use `createBoundedQueue<T>()` to decouple event emission from async processing. Never block the EventBus callback with await.

```typescript
import { createBoundedQueue } from "../ingestion/queue.js";

const queue = createBoundedQueue<{ id: string; conversation: string }>({
  maxSize: 500,
  handler: async (item) => {
    const msg = db.getMessage(item.id);
    if (msg) await ingestBridgeMessage(mdb, secretFilter, repo, msg);
  },
  onDrop: (item) => bus.emit({ type: "memory:ingestion_dropped", data: item }),
  onError: (err) => logger.error("ingestion error", err),
});

bus.on("message:created", (event) => queue.enqueue({ id: event.data.id, conversation: event.data.conversation }));
```

When the queue is full (`maxSize` items pending), the **oldest** item is dropped and `onDrop` is called. This preserves recent messages at the cost of older ones — intentional tradeoff for backpressure.

## EmbeddingService — Lazy Initialization

The embedding model (`nomic-embed-text-v1.5`, 768-dim) is downloaded on first use. Never await `embed()` in a hot path. Call `warmUp()` at server startup to pre-load the model asynchronously.

```typescript
import { createEmbeddingService } from "../ingestion/embedding.js";

const embedService = createEmbeddingService();
embedService.warmUp(); // fire-and-forget at startup

// Later, in ingestion handler
const result = await embedService.embed(text);
if (!result.ok) {
  // Model failed to initialize — fall back to keyword search
  logger.warn("embedding degraded, falling back");
  return keywordOnlyPath();
}
const vector: Float32Array = result.data; // 768-dim
```

Always check `result.ok` — after a failed initialization, `isDegraded()` returns `true` and subsequent `embed()` calls return an error immediately without retrying the model load. Memory search falls back to FTS5-only in degraded mode.

Text is truncated to 32,000 chars (configurable via `maxChars`) before embedding — this is a rough proxy for the model's 8,192-token limit.

## Secret Filter — Redact Before Storing

Apply secret filtering to any user-generated text before storing in the memory graph:

```typescript
import { createSecretFilter } from "../ingestion/secret-filter.js";

const filter = createSecretFilter();

const redacted = filter.redact(message.payload);
// Stores "[REDACTED]" in place of detected secrets

if (filter.hasSecrets(text)) {
  logger.warn("secrets detected in message payload");
}
```

The filter detects: AWS keys (`AKIA...`), Slack tokens (`xoxb-...`), GitHub tokens (`ghp_...`), Anthropic keys (`sk-ant-...`), Bearer tokens, PEM private keys, database connection strings, password fields, and `SECRET_*` / `_KEY` env var patterns.

Always redact `message.payload` in `ingestBridgeMessage` before creating the memory node.

## Ingestion Services

### ingestBridgeMessage

Creates a memory node for a bridge message, links it to the conversation node (creating the conversation node if needed). Idempotent — checks `getNodeBySource("bridge", msg.id)` first.

```typescript
const result = await ingestBridgeMessage(mdb, secretFilter, repo, messageRow);
// Returns AppResult<MemoryNode>
```

### backfillBridge

Ingests all existing bridge messages and tasks not yet in memory. Called at server startup before subscribing to the EventBus. Uses `ingestion_cursors` to track progress.

```typescript
await backfillBridge(memoryDb, bridgeDb, secretFilter, repo);
// Then subscribe to EventBus for new messages
```

### extractDecisions

Regex-based heuristic extraction of decision nodes from message bodies. Patterns: `decision ~`, `we chose`, `chosen:`, `decided to`. Creates `decision` kind nodes linked to the source message.

### inferTopics

k-means++ clustering over message embeddings. Groups semantically similar messages into `topic` nodes. Requires a functioning EmbeddingService — skip if degraded.

## Idempotency

All ingestion services must be safe to re-run:
- Check `mdb.getNodeBySource(sourceType, sourceId)` before inserting
- Use `ingestion_cursors` to track streaming progress (git commits, transcript lines)
- Return the existing node if already ingested — don't error, don't re-insert

## Transcript Parser

The transcript parser reads JSONL files where each line is a JSON object with `role`, `content`, and optional `timestamp`. Feed lines to `parseTranscriptLine(line)` which returns `TranscriptEntry | null` (returns null for malformed lines — skip gracefully).
