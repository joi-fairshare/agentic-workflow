---
globs: ["mcp-bridge/src/ingestion/**", "mcp-bridge/src/application/services/ingest-*.ts", "mcp-bridge/src/application/services/extract-*.ts", "mcp-bridge/src/application/services/infer-*.ts"]
# Note: these globs intentionally overlap with bridge-services.md (mcp-bridge/src/application/**).
# Both rule files load when editing ingestion services — bridge-services.md covers AppResult/EventBus
# patterns, this file covers ingestion-specific infrastructure (queues, embeddings, secret filtering).
---

# Ingestion Rules

## AsyncQueue<T> — Unbounded Async Processing

Use `createAsyncQueue<T>()` to decouple event emission from async processing. Never block the EventBus callback with await.

```typescript
import { createAsyncQueue } from "../ingestion/queue.js";

const queue = createAsyncQueue<{ id: string; conversation: string }>({
  handler: async (item) => {
    const msg = db.getMessage(item.id);
    if (msg) await ingestBridgeMessage(mdb, secretFilter, repo, msg);
  },
  onError: (err) => logger.error("ingestion error", err),
});

bus.subscribe((event) => {
  if (event.type === "message:created") {
    queue.enqueue({ id: event.data.id, conversation: event.data.conversation });
  }
});
```

The queue is **unbounded** — items are never dropped. Processing is serial (`setImmediate`-based drain loop): one item at a time, next item starts after current completes. Use `queue.depth()` to check pending count. Call `queue.stop()` on shutdown — it clears the buffer and prevents new processing.

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
// Returns AppResult<NodeRow>
```

### backfillBridge

Ingests all existing bridge messages and tasks not yet in memory. Called at server startup before subscribing to the EventBus. Uses `ingestion_cursors` to track progress.

```typescript
await backfillBridge(memoryDb, bridgeDb, secretFilter, repo);
// Then subscribe to EventBus for new messages
```

### extractDecisions

Regex-based heuristic extraction of decision nodes from message bodies. Matches six patterns: `we/I decided to/that/on ...`, `the decision is/was to ...`, `going with/for ...`, `chose ... over ...`, `we're/we'll/we will/we are use/using/adopt/go with ...`, and `let's/let us use/go with/switch to/adopt ...`. Creates `decision` kind nodes linked to the source message. Deduplicates by title within the same conversation.

### inferTopics

k-means++ clustering over message embeddings. Groups semantically similar messages into `topic` nodes. Requires a functioning EmbeddingService — skip if degraded.

## Idempotency

All ingestion services must be safe to re-run:
- Check `mdb.getNodeBySource(sourceType, sourceId)` before inserting
- Use `ingestion_cursors` to track streaming progress (git commits, transcript lines)
- Return the existing node if already ingested — don't error, don't re-insert

## SessionQueue — Rate-Limited Single-Item Processing

`createSessionQueue` processes one job at a time on a fixed interval (rate-limited, not batched). Use for Claude Code session ingestion to avoid hammering the embedding model:

```typescript
import { createSessionQueue, type SessionJob } from "../ingestion/session-queue.js";

const sessionQueue = createSessionQueue({
  rateMs: 5000, // one job every 5 seconds
  handler: async (job: SessionJob) => {
    await ingestClaudeCode(mdb, embedService, secretFilter, repo, job);
  },
  onError: (err, job) => logger.error("session ingestion failed", { err, job }),
});

sessionQueue.enqueue({ sessionId, filePath, repo, pass: "both" });
```

`SessionJob.pass` controls ingestion depth: `"summary"` creates one node per turn, `"detail"` expands individual tool use blocks, `"both"` runs summary then detail. Unlike `AsyncQueue` which processes items serially via `setImmediate`, `SessionQueue` uses a rate-limited fixed-interval timer and processes one item per tick. Stop it with `sessionQueue.stop()` on server shutdown.

## Claude Code Parser

`parseSession(jsonlPath)` reads a `.jsonl` file and returns a `ParsedSession` with typed turns:

```typescript
import { parseSession, type ParsedSession, type ClaudeCodeTurn } from "../ingestion/claude-code-parser.js";

const session: ParsedSession = await parseSession("/path/to/session.jsonl");
// session.metadata — { sessionId, cwd, gitBranch, version, entrypoint }
// session.turns    — ClaudeCodeTurn[] (paired human+assistant exchanges)
// session.skipped  — count of unmatched or malformed lines
```

Each `ClaudeCodeTurn` contains:
- `human.content` — the user message text
- `assistant.visibleText` — text blocks only (no thinking blocks)
- `assistant.hasThinking` — true if any extended thinking blocks were present
- `assistant.toolUses` — `ToolUseInfo[]` with `name`, `input`, `isSubagent`, `subagentType`
- `assistant.uuids` — all UUIDs for this turn (used for detail-pass expansion)

The parser skips `file-history-snapshot`, `progress`, and `system` line types, and ignores tool_result user messages (they're paired with prior assistant tool calls).

## Claude Code File Watcher

`createClaudeCodeWatcher` watches a directory for `.jsonl` session files and enqueues them for ingestion. Files are debounced (500ms) and deduplicated so the same file isn't enqueued twice:

```typescript
import { createClaudeCodeWatcher } from "../ingestion/claude-code-watcher.js";

const watcher = createClaudeCodeWatcher({
  watchDir: "~/.claude/projects/",
  repo,
  sessionQueue,
  logger,
});

watcher.start();
// ... on shutdown:
await watcher.stop();
```

The watcher uses Node.js `fs.watch` with recursive mode. New files trigger a summary pass; subsequent modifications trigger a detail pass. Only `.jsonl` files matching the Claude Code session format are processed.

## Claude Code Ingestion Service

`ingestClaudeCode` ingests a parsed session into memory with two-level expansion:

```typescript
import { ingestClaudeCode } from "./ingest-claude-code.js";

const result = await ingestClaudeCode(mdb, embedService, secretFilter, repo, {
  sessionId, filePath, repo, pass: "both",
});
// Returns AppResult<{ nodes: NodeRow[]; edges: EdgeRow[] }>
```

**Summary pass**: One `message` node per turn (human+assistant concatenated), linked to the conversation node via `contains`. Sets `sender` to `"claude-code"`.

**Detail pass**: Expands tool use blocks into `artifact` nodes linked to their parent turn node via `implemented_by`. Subagent dispatches create `task` nodes linked via `assigned_in`.

## Generic Ingestion Service

`ingestGeneric` ingests a list of `{ role, content, timestamp? }` messages into memory. Use for arbitrary chat transcripts that don't follow the Claude Code JSONL format:

```typescript
import { ingestGeneric } from "./ingest-generic.js";

const result = await ingestGeneric(mdb, embedService, secretFilter, repo, {
  conversationId: "my-conversation",
  messages: [{ role: "user", content: "hello" }, { role: "assistant", content: "hi" }],
  sender: "my-agent",
});
// Returns AppResult<{ nodes: NodeRow[]; edges: EdgeRow[] }>
```

## Transcript Parser

The transcript parser reads JSONL files where each line is a JSON object with `role`, `content`, and optional `timestamp`. Feed lines to `parseTranscriptLine(line)` which returns `TranscriptEntry | null` (returns null for malformed lines — skip gracefully).
