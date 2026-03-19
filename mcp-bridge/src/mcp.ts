import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createDatabase } from "./db/schema.js";
import { createDbClient, type DbClient } from "./db/client.js";
import { sendContext } from "./application/services/send-context.js";
import { getMessagesByConversation, getUnreadMessages } from "./application/services/get-messages.js";
import { assignTask } from "./application/services/assign-task.js";
import { reportStatus } from "./application/services/report-status.js";

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

export async function startMcpServer(dbPath?: string) {
  const database = createDatabase(dbPath);
  const db: DbClient = createDbClient(database);

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

  // ── Start ──────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run as standalone MCP server
startMcpServer().catch((err) => {
  console.error("MCP server failed to start:", err);
  process.exit(1);
});
