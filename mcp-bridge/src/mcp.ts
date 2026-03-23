import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createDatabase } from "./db/schema.js";
import { createDbClient, type DbClient } from "./db/client.js";
import { sendContext } from "./application/services/send-context.js";
import { getMessagesByConversation, getUnreadMessages } from "./application/services/get-messages.js";
import { assignTask } from "./application/services/assign-task.js";
import { reportStatus } from "./application/services/report-status.js";
import { createMemoryDatabase, NODE_KINDS, EDGE_KINDS } from "./db/memory-schema.js";
import { createMemoryDbClient, type MemoryDbClient } from "./db/memory-client.js";
import { createEmbeddingService, type EmbeddingService } from "./ingestion/embedding.js";
import { createSecretFilter } from "./ingestion/secret-filter.js";
import { searchMemory } from "./application/services/search-memory.js";
import { traverseMemory } from "./application/services/traverse-memory.js";
import { assembleContext } from "./application/services/assemble-context.js";
import { ingestGenericChat } from "./application/services/ingest-generic.js";
import { ingestClaudeCodeSummary } from "./application/services/ingest-claude-code.js";

// NOTE: a copy of this function exists in tests/mcp-tools.test.ts for unit-testing
// the MCP tool handlers without invoking the real server. Both copies must stay
// in sync. If you change this formatting logic, update the test copy (and vice versa).
function resultToContent<T>(result: { ok: true; data: T } | { ok: false; error: { code: string; message: string } }) {
  if (result.ok) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
    };
  }
  return {
    content: [{ type: "text" as const, text: `Error [${result.error.code}]: ${result.error.message}` }],
    isError: true,
  };
}

// Resolve paths relative to the package root (parent of dist/) so both
// the REST server and the MCP stdio server use the same database files
// regardless of which working directory the process starts in.
const __filename = fileURLToPath(import.meta.url);
const PKG_ROOT = join(dirname(__filename), "..");

export async function startMcpServer(dbPath?: string) {
  const resolvedDbPath = dbPath ?? process.env["DB_PATH"] ?? join(PKG_ROOT, "bridge.db");
  const database = createDatabase(resolvedDbPath);
  const db: DbClient = createDbClient(database);

  const MEMORY_DB_PATH = process.env["MEMORY_DB_PATH"] ?? join(PKG_ROOT, "memory.db");
  const memoryRaw = createMemoryDatabase(MEMORY_DB_PATH);
  const mdb: MemoryDbClient = createMemoryDbClient(memoryRaw);
  const embedService: EmbeddingService = createEmbeddingService();
  const filter = createSecretFilter();

  const server = new McpServer({
    name: "agentic-workflow-bridge",
    version: "1.0.0",
  });

  // ── send_context ───────────────────────────────────────

  server.tool(
    "send_context",
    "Send task context and meta-prompt from one agent to another. Messages are persisted and queued for pickup.",
    {
      conversation: z.string().uuid().describe("Conversation UUID — use crypto.randomUUID() to start a new one"),
      sender: z.string().min(1).describe("Sender agent identifier (e.g. 'claude-code', 'codex')"),
      recipient: z.string().min(1).describe("Recipient agent identifier"),
      payload: z.string().min(1).describe("The context or message content to send"),
      meta_prompt: z.string().optional().describe("Optional meta-prompt guiding how the recipient should process this"),
    },
    async ({ conversation, sender, recipient, payload, meta_prompt }) => {
      const result = sendContext(db, { conversation, sender, recipient, payload, meta_prompt });
      return resultToContent(result);
    },
  );

  // ── get_messages ───────────────────────────────────────

  server.tool(
    "get_messages",
    "Retrieve all messages for a conversation by UUID. Returns full history in chronological order.",
    {
      conversation: z.string().uuid().describe("Conversation UUID to retrieve messages for"),
    },
    async ({ conversation }) => {
      const result = getMessagesByConversation(db, conversation);
      return resultToContent(result);
    },
  );

  // ── get_unread ─────────────────────────────────────────

  server.tool(
    "get_unread",
    "Check for unread messages addressed to a specific agent. Messages are marked as read on retrieval.",
    {
      recipient: z.string().min(1).describe("Agent identifier to check for unread messages"),
    },
    async ({ recipient }) => {
      const result = getUnreadMessages(db, recipient);
      return resultToContent(result);
    },
  );

  // ── assign_task ────────────────────────────────────────

  server.tool(
    "assign_task",
    "Assign a task with domain, implementation details, and optional analysis request. Creates both a task record and a conversation message.",
    {
      conversation: z.string().uuid().describe("Conversation UUID this task belongs to"),
      domain: z.string().min(1).describe("Task domain (e.g. 'frontend', 'backend', 'security')"),
      summary: z.string().min(1).describe("Brief task summary"),
      details: z.string().min(1).describe("Detailed implementation instructions"),
      analysis: z.string().optional().describe("Analysis or research request to accompany the task"),
      assigned_to: z.string().optional().describe("Agent identifier to assign the task to"),
    },
    async ({ conversation, domain, summary, details, analysis, assigned_to }) => {
      const result = assignTask(db, { conversation, domain, summary, details, analysis, assigned_to });
      return resultToContent(result);
    },
  );

  // ── report_status ──────────────────────────────────────

  server.tool(
    "report_status",
    "Report back with feedback, suggestions, or completion status. Optionally updates an associated task.",
    {
      conversation: z.string().uuid().describe("Conversation UUID"),
      sender: z.string().min(1).describe("Reporting agent identifier"),
      recipient: z.string().min(1).describe("Agent to notify"),
      task_id: z.string().uuid().optional().describe("Task ID to update status on"),
      status: z.enum(["in_progress", "completed", "failed"]).describe("Current status"),
      payload: z.string().min(1).describe("Status report content — feedback, suggestions, or completion details"),
    },
    async ({ conversation, sender, recipient, task_id, status, payload }) => {
      const result = reportStatus(db, { conversation, sender, recipient, task_id, status, payload });
      return resultToContent(result);
    },
  );

  // ── search_memory ──────────────────────────────────────

  server.tool(
    "search_memory",
    "Search conversation memory using hybrid FTS5+vector search",
    {
      query: z.string().describe("Search query"),
      repo: z.string().describe("Repository slug filter"),
      kinds: z.array(z.enum(NODE_KINDS)).optional().describe("Node kinds to include"),
      limit: z.number().optional().describe("Max results (default 20)"),
      mode: z.enum(["semantic", "keyword", "hybrid"]).optional().describe("Search mode"),
    },
    async ({ query, repo, kinds, limit, mode }) => {
      const result = await searchMemory(mdb, embedService, {
        query,
        repo,
        kinds,
        limit,
        mode,
      });
      return resultToContent(result);
    },
  );

  // ── traverse_memory ────────────────────────────────────

  server.tool(
    "traverse_memory",
    "BFS traverse the memory graph from a starting node",
    {
      node_id: z.string().describe("Starting node UUID"),
      direction: z.enum(["outgoing", "incoming", "both"]).optional().describe("Traversal direction"),
      edge_kinds: z.array(z.string()).optional().describe("Edge kinds to follow"),
      max_depth: z.number().optional().describe("Maximum traversal depth"),
      max_nodes: z.number().optional().describe("Maximum nodes to return"),
    },
    async ({ node_id, direction, edge_kinds, max_depth, max_nodes }) => {
      const result = traverseMemory(mdb, { node_id, direction, edge_kinds, max_depth, max_nodes });
      return resultToContent(result);
    },
  );

  // ── get_context ────────────────────────────────────────

  server.tool(
    "get_context",
    "Assemble token-budgeted context from memory for an agent",
    {
      query: z.string().optional().describe("Search query to find relevant context"),
      node_id: z.string().optional().describe("Specific node to start from"),
      repo: z.string().describe("Repository slug"),
      max_tokens: z.number().optional().describe("Token budget for assembled context"),
    },
    async ({ query, node_id, repo, max_tokens }) => {
      const result = await assembleContext(mdb, embedService, { query, node_id, repo, max_tokens });
      return resultToContent(result);
    },
  );

  // ── create_memory_link ─────────────────────────────────

  server.tool(
    "create_memory_link",
    "Create an edge between two memory nodes",
    {
      from_node: z.string().describe("Source node UUID"),
      to_node: z.string().describe("Target node UUID"),
      kind: z.enum(EDGE_KINDS).describe("Edge kind (e.g. related_to, references, led_to)"),
      note: z.string().optional().describe("Optional note stored in edge meta"),
    },
    async ({ from_node, to_node, kind, note }) => {
      const sourceNode = mdb.getNode(from_node);
      if (!sourceNode) {
        return resultToContent({ ok: false as const, error: { code: "NOT_FOUND", message: `Node ${from_node} not found` } });
      }
      const filteredNote = note ? filter.redact(note) : "";
      const edge = mdb.insertEdge({
        repo: sourceNode.repo,
        from_node,
        to_node,
        kind,
        weight: 1.0,
        meta: filteredNote ? JSON.stringify({ note: filteredNote }) : "{}",
        auto: false,
      });
      return resultToContent({ ok: true as const, data: edge });
    },
  );

  // ── create_memory_node ─────────────────────────────────

  server.tool(
    "create_memory_node",
    "Create a topic or decision node in memory",
    {
      repo: z.string().describe("Repository slug"),
      kind: z.enum(["topic", "decision"]).describe("Node kind"),
      title: z.string().describe("Node title"),
      body: z.string().optional().describe("Node body content"),
      related_to: z.string().optional().describe("UUID of an existing node to link with a related_to edge"),
    },
    async ({ repo, kind, title, body, related_to }) => {
      const filteredTitle = filter.redact(title);
      const filteredBody = body ? filter.redact(body) : "";
      const node = mdb.insertNode({
        repo,
        kind,
        title: filteredTitle,
        body: filteredBody,
        meta: "{}",
        source_id: randomUUID(),
        source_type: "manual",
      });
      if (related_to) {
        mdb.insertEdge({
          repo,
          from_node: node.id,
          to_node: related_to,
          kind: "related_to",
          weight: 1.0,
          meta: "{}",
          auto: false,
        });
      }
      return resultToContent({ ok: true as const, data: node });
    },
  );

  // ── ingest_conversation ────────────────────────────────

  server.tool(
    "ingest_conversation",
    "Ingest a conversation into the memory graph for long-term preservation.",
    {
      repo: z.string().describe("Repository slug"),
      source: z.enum(["claude-code", "transcript", "generic"]).describe("Ingestion format"),
      session_id: z.string().describe("Unique session ID for idempotency"),
      title: z.string().optional().describe("Conversation title"),
      content: z.string().optional().describe("Inline content (generic format)"),
      path: z.string().optional().describe("File path (transcript/claude-code format)"),
      agent: z.string().optional().describe("Agent identifier"),
    },
    async ({ repo, source, session_id, title, content, path }) => {
      if (source === "generic") {
        if (!content) {
          return resultToContent({ ok: false as const, error: { code: "VALIDATION", message: "content is required for generic source" } });
        }
        let messages: Array<{ role: string; content: string; timestamp?: string }>;
        try {
          messages = JSON.parse(content) as Array<{ role: string; content: string; timestamp?: string }>;
        } catch {
          return resultToContent({ ok: false as const, error: { code: "VALIDATION", message: "content must be a valid JSON array of messages" } });
        }
        const result = ingestGenericChat(mdb, filter, {
          repo,
          sessionId: session_id,
          sessionTitle: title ?? session_id,
          messages,
        });
        return resultToContent(result);
      }

      if (source === "claude-code") {
        if (!path) {
          return resultToContent({ ok: false as const, error: { code: "VALIDATION", message: "path is required for claude-code source" } });
        }
        let lines: string[];
        try {
          const raw = readFileSync(path, "utf-8");
          lines = raw.split("\n").filter((l) => l.trim().length > 0);
        } catch {
          return resultToContent({ ok: false as const, error: { code: "IO_ERROR", message: `Failed to read file: ${path}` } });
        }
        const result = ingestClaudeCodeSummary(mdb, filter, {
          repo,
          sessionId: session_id,
          filePath: path,
          lines,
        });
        return resultToContent(result);
      }

      // source === "transcript"
      if (!path) {
        return resultToContent({ ok: false as const, error: { code: "VALIDATION", message: "path is required for transcript source" } });
      }
      let lines: string[];
      try {
        const raw = readFileSync(path, "utf-8");
        lines = raw.split("\n").filter((l) => l.trim().length > 0);
      } catch {
        return resultToContent({ ok: false as const, error: { code: "IO_ERROR", message: `Failed to read file: ${path}` } });
      }
      // Dynamically import to avoid circular dependency issues
      const { ingestTranscriptLines } = await import("./application/services/ingest-transcript.js");
      const result = ingestTranscriptLines(mdb, filter, {
        repo,
        sessionId: session_id,
        sessionTitle: title ?? session_id,
        lines,
      });
      return resultToContent(result);
    },
  );

  // ── Start ──────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);

  embedService.warmUp().catch((err) => {
    console.warn("Embedding model pre-warm failed (will retry on first request):", err);
  });
}

// Run as standalone MCP server
startMcpServer().catch((err) => {
  console.error("MCP server failed to start:", err);
  process.exit(1);
});
