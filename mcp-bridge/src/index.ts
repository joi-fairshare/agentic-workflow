import { join, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import cors from "@fastify/cors";
import { createDatabase } from "./db/schema.js";
import { createDbClient } from "./db/client.js";
import { createMemoryDatabase } from "./db/memory-schema.js";
import { createMemoryDbClient } from "./db/memory-client.js";
import { createEventBus } from "./application/events.js";
import { createEmbeddingService } from "./ingestion/embedding.js";
import { createSecretFilter } from "./ingestion/secret-filter.js";
import { createAsyncQueue } from "./ingestion/queue.js";
import { createSessionQueue } from "./ingestion/session-queue.js";
import { createClaudeCodeWatcher } from "./ingestion/claude-code-watcher.js";
import { ingestBridgeMessage, backfillBridge } from "./application/services/ingest-bridge.js";
import { ingestClaudeCodeSummary, expandClaudeCodeTurn } from "./application/services/ingest-claude-code.js";
import { createMessageRoutes } from "./routes/messages.js";
import { createTaskRoutes } from "./routes/tasks.js";
import { createConversationRoutes } from "./routes/conversations.js";
import { createMemoryRoutes } from "./routes/memory.js";
import { registerSseRoute } from "./routes/events.js";
import { createServer } from "./server.js";

// Resolve paths relative to the package root (parent of dist/) so both
// the REST server and the MCP stdio server use the same database files
// regardless of which working directory the process starts in.
const __filename = fileURLToPath(import.meta.url);
const PKG_ROOT = join(dirname(__filename), "..");

const PORT = parseInt(process.env["PORT"] ?? "3100", 10);
const HOST = process.env["HOST"] ?? "127.0.0.1";
const DB_PATH = process.env["DB_PATH"] ?? join(PKG_ROOT, "bridge.db");

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);
if (!LOOPBACK.has(HOST) && !process.env["ALLOW_REMOTE"]) {
  console.error(
    `Refusing to bind to ${HOST} — this server has no authentication.\n` +
    `Set ALLOW_REMOTE=1 to override (not recommended for untrusted networks).`,
  );
  process.exit(1);
}

async function main() {
  const database = createDatabase(DB_PATH);
  const db = createDbClient(database);
  const eventBus = createEventBus();

  // Memory system init (separate DB file)
  const MEMORY_DB_PATH = process.env["MEMORY_DB_PATH"] ?? join(PKG_ROOT, "memory.db");
  const memoryRaw = createMemoryDatabase(MEMORY_DB_PATH);
  const memoryDb = createMemoryDbClient(memoryRaw);
  const embedService = createEmbeddingService(); // P0: lazy init, loads model on first embed()
  const secretFilter = createSecretFilter();

  // Repo slug for ingestion — derive from env or fallback to default
  const REPO_SLUG = process.env["REPO_SLUG"] ?? "default";

  // Async ingestion queue — decouple EventBus from memory ingestion
  const ingestionQueue = createAsyncQueue<{ id: string; conversation: string }>({
    handler: async (event) => {
      const msg = db.getMessage(event.id);
      if (!msg) return;
      ingestBridgeMessage(memoryDb, secretFilter, REPO_SLUG, msg);
    },
    onError: (err) => {
      console.error("Ingestion queue handler error:", err);
    },
  });

  const messageRoutes = createMessageRoutes(db, eventBus);
  const taskRoutes = createTaskRoutes(db, eventBus);
  const conversationRoutes = createConversationRoutes(db);
  const memoryRoutes = createMemoryRoutes(memoryDb, embedService, secretFilter);

  const server = createServer([messageRoutes, taskRoutes, conversationRoutes, memoryRoutes]);

  // CORS — allow all origins (dev tool, no auth)
  await server.register(cors, { origin: true });

  // SSE — long-lived connections, outside normal route pattern
  registerSseRoute(server, eventBus);

  await server.listen({ port: PORT, host: HOST });

  console.log(`Bridge server running at http://${HOST}:${PORT}`);

  // Pre-warm the embedding model in the background so the first /memory/search
  // or /memory/ingest request is not blocked by multi-second model loading.
  embedService.warmUp().catch((err) => {
    console.warn("Embedding model pre-warm failed (will retry on first request):", err);
  });
  console.log(`SSE stream available at http://${HOST}:${PORT}/events`);
  console.log(`MCP server available via: node dist/mcp.js`);

  // Background backfill (non-blocking) — subscribe to EventBus only after backfill completes
  // to avoid duplicate ingestion from racing with the queue
  setImmediate(async () => {
    const result = await backfillBridge(memoryDb, db, secretFilter, REPO_SLUG);
    if (result.ok) {
      console.log(`Memory backfill complete — ${result.data.messages_ingested} messages, ${result.data.tasks_ingested} tasks`);
    } else {
      console.error("Memory backfill failed:", result.error.message);
    }

    // Subscribe EventBus → ingestion queue (after backfill to avoid race)
    eventBus.subscribe((event) => {
      if (event.type === "message:created") {
        ingestionQueue.enqueue(event.data);
      }
    });
  });

  // Claude Code session auto-ingestion
  const sessionQueue = createSessionQueue({
    rateMs: 5000,
    handler: async (job) => {
      const lines = readFileSync(job.filePath, "utf-8").split("\n");
      const summaryResult = ingestClaudeCodeSummary(memoryDb, secretFilter, {
        repo: job.repo,
        sessionId: job.sessionId,
        filePath: job.filePath,
        lines,
      });
      if (!summaryResult.ok) {
        console.warn(`[session-queue] Summary failed for ${job.sessionId}:`, summaryResult.error.message);
        return;
      }
      eventBus.emit({
        type: "memory:session_ingested",
        data: { id: summaryResult.data.conversation_id, repo: job.repo, sessionId: job.sessionId },
      });
      if (job.pass === "both" || job.pass === "detail") {
        const convNode = memoryDb.getNodeBySource("claude-code-session", job.sessionId);
        if (convNode) {
          const turnEdges = memoryDb.getEdgesFrom(convNode.id).filter(e => e.kind === "contains");
          for (const edge of turnEdges) {
            const turn = memoryDb.getNode(edge.to_node);
            if (turn && turn.sender === "assistant") {
              expandClaudeCodeTurn(memoryDb, secretFilter, turn.id, lines);
            }
          }
        }
      }
    },
    onError: (err, job) => console.warn(`[session-queue] Error processing ${job.sessionId}:`, err.message),
  });

  const claudeDir = join(homedir(), ".claude", "projects");
  const watcher = createClaudeCodeWatcher({
    watchDir: claudeDir,
    mdb: memoryDb,
    queue: sessionQueue,
    filter: secretFilter,
  });

  // Startup: prune old traversal logs, scan for unprocessed sessions, then start watching
  setImmediate(async () => {
    memoryDb.pruneTraversalLogs(30);
    await watcher.scanOnce();
    watcher.start();
  });
}

main().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
