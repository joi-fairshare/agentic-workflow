import { join } from "node:path";
import cors from "@fastify/cors";
import { createDatabase } from "./db/schema.js";
import { createDbClient } from "./db/client.js";
import { createMemoryDatabase } from "./db/memory-schema.js";
import { createMemoryDbClient } from "./db/memory-client.js";
import { createEventBus } from "./application/events.js";
import { createEmbeddingService } from "./ingestion/embedding.js";
import { createSecretFilter } from "./ingestion/secret-filter.js";
import { createBoundedQueue } from "./ingestion/queue.js";
import { ingestBridgeMessage, backfillBridge } from "./application/services/ingest-bridge.js";
import { createMessageRoutes } from "./routes/messages.js";
import { createTaskRoutes } from "./routes/tasks.js";
import { createConversationRoutes } from "./routes/conversations.js";
import { createMemoryRoutes } from "./routes/memory.js";
import { registerSseRoute } from "./routes/events.js";
import { createServer } from "./server.js";

const PORT = parseInt(process.env["PORT"] ?? "3100", 10);
const HOST = process.env["HOST"] ?? "127.0.0.1";
const DB_PATH = process.env["DB_PATH"];

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
  const MEMORY_DB_PATH = process.env["MEMORY_DB_PATH"] ?? join(process.cwd(), "memory.db");
  const memoryRaw = createMemoryDatabase(MEMORY_DB_PATH);
  const memoryDb = createMemoryDbClient(memoryRaw);
  const embedService = createEmbeddingService(); // P0: lazy init, loads model on first embed()
  const secretFilter = createSecretFilter();

  // Repo slug for ingestion — derive from env or fallback to default
  const REPO_SLUG = process.env["REPO_SLUG"] ?? "default";

  // P0: Async ingestion queue — decouple EventBus from ingestion
  const ingestionQueue = createBoundedQueue<{ id: string; conversation: string }>({
    maxSize: 500,
    handler: async (event) => {
      const msg = db.getMessage(event.id);
      if (!msg) return;
      ingestBridgeMessage(memoryDb, secretFilter, REPO_SLUG, msg);
    },
    onDrop: () => {
      eventBus.emit({ type: "memory:ingestion_dropped", data: { reason: "queue_full" } });
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
}

main().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
