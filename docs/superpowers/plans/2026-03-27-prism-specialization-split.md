# Prism Specialization Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the agentic-bridge down to 5 coordination-only MCP tools + slim REST API, delegating memory and visualization entirely to prism-mcp.

**Architecture:** Delete the memory layer (ingestion pipeline, memory DB, 6 MCP tools, REST memory routes, SSE route, EventBus) and the UI. Keep: 5 MCP tools, Fastify REST API for messages/tasks/conversations, bridge DB. No subscribers remain for EventBus so it is removed too.

**Tech Stack:** TypeScript 5.7, Fastify 5, better-sqlite3, @modelcontextprotocol/sdk, Zod 3, Vitest

**Spec:** `docs/superpowers/specs/2026-03-27-prism-specialization-split-design.md`

---

### Task 1: Delete memory source files

**Files:**
- Delete: `mcp-bridge/src/ingestion/` (entire directory)
- Delete: `mcp-bridge/src/application/events.ts`
- Delete: `mcp-bridge/src/application/services/assemble-context.ts`
- Delete: `mcp-bridge/src/application/services/extract-decisions.ts`
- Delete: `mcp-bridge/src/application/services/infer-topics.ts`
- Delete: `mcp-bridge/src/application/services/ingest-bridge.ts`
- Delete: `mcp-bridge/src/application/services/ingest-claude-code.ts`
- Delete: `mcp-bridge/src/application/services/ingest-generic.ts`
- Delete: `mcp-bridge/src/application/services/ingest-git.ts`
- Delete: `mcp-bridge/src/application/services/ingest-transcript.ts`
- Delete: `mcp-bridge/src/application/services/search-memory.ts`
- Delete: `mcp-bridge/src/application/services/traverse-memory.ts`
- Delete: `mcp-bridge/src/db/memory-client.ts`
- Delete: `mcp-bridge/src/db/memory-schema.ts`
- Delete: `mcp-bridge/src/routes/events.ts`
- Delete: `mcp-bridge/src/routes/memory.ts`
- Delete: `mcp-bridge/src/transport/controllers/memory-controller.ts`
- Delete: `mcp-bridge/src/transport/schemas/memory-schemas.ts`

- [ ] **Step 1: Delete ingestion directory and memory application files**

```bash
cd /Users/thor/repos/agentic-workflow/mcp-bridge
rm -rf src/ingestion/
rm src/application/events.ts
rm src/application/services/assemble-context.ts
rm src/application/services/extract-decisions.ts
rm src/application/services/infer-topics.ts
rm src/application/services/ingest-bridge.ts
rm src/application/services/ingest-claude-code.ts
rm src/application/services/ingest-generic.ts
rm src/application/services/ingest-git.ts
rm src/application/services/ingest-transcript.ts
rm src/application/services/search-memory.ts
rm src/application/services/traverse-memory.ts
```

- [ ] **Step 2: Delete memory DB and transport files**

```bash
cd /Users/thor/repos/agentic-workflow/mcp-bridge
rm src/db/memory-client.ts
rm src/db/memory-schema.ts
rm src/routes/events.ts
rm src/routes/memory.ts
rm src/transport/controllers/memory-controller.ts
rm src/transport/schemas/memory-schemas.ts
```

- [ ] **Step 3: Commit deletions**

```bash
cd /Users/thor/repos/agentic-workflow
git add -A
git commit -m "chore: delete memory layer source files"
```

---

### Task 2: Delete memory test files

**Files:**
- Delete: `mcp-bridge/tests/assemble-context.test.ts`
- Delete: `mcp-bridge/tests/claude-code-parser.test.ts`
- Delete: `mcp-bridge/tests/claude-code-watcher.test.ts`
- Delete: `mcp-bridge/tests/embedding.test.ts`
- Delete: `mcp-bridge/tests/events.test.ts`
- Delete: `mcp-bridge/tests/extract-decisions.test.ts`
- Delete: `mcp-bridge/tests/infer-topics.test.ts`
- Delete: `mcp-bridge/tests/ingest-bridge.test.ts`
- Delete: `mcp-bridge/tests/ingest-claude-code.test.ts`
- Delete: `mcp-bridge/tests/ingest-generic.test.ts`
- Delete: `mcp-bridge/tests/ingest-git.test.ts`
- Delete: `mcp-bridge/tests/ingest-transcript.test.ts`
- Delete: `mcp-bridge/tests/memory-client.test.ts`
- Delete: `mcp-bridge/tests/memory-controller.test.ts`
- Delete: `mcp-bridge/tests/memory-schema.test.ts`
- Delete: `mcp-bridge/tests/queue.test.ts`
- Delete: `mcp-bridge/tests/search-memory.test.ts`
- Delete: `mcp-bridge/tests/secret-filter.test.ts`
- Delete: `mcp-bridge/tests/session-queue.test.ts`
- Delete: `mcp-bridge/tests/sse-integration.test.ts`
- Delete: `mcp-bridge/tests/transcript-parser.test.ts`
- Delete: `mcp-bridge/tests/traversal-logs.test.ts`
- Delete: `mcp-bridge/tests/traverse-memory.test.ts`

- [ ] **Step 1: Delete all memory-related test files**

```bash
cd /Users/thor/repos/agentic-workflow/mcp-bridge/tests
rm assemble-context.test.ts claude-code-parser.test.ts claude-code-watcher.test.ts \
   embedding.test.ts events.test.ts extract-decisions.test.ts infer-topics.test.ts \
   ingest-bridge.test.ts ingest-claude-code.test.ts ingest-generic.test.ts \
   ingest-git.test.ts ingest-transcript.test.ts memory-client.test.ts \
   memory-controller.test.ts memory-schema.test.ts queue.test.ts \
   search-memory.test.ts secret-filter.test.ts session-queue.test.ts \
   sse-integration.test.ts transcript-parser.test.ts traversal-logs.test.ts \
   traverse-memory.test.ts
```

- [ ] **Step 2: Commit**

```bash
cd /Users/thor/repos/agentic-workflow
git add -A
git commit -m "chore: delete memory layer test files"
```

---

### Task 3: Slim mcp.ts

**Files:**
- Modify: `mcp-bridge/src/mcp.ts`

Remove all 6 memory tools and every memory/embedding import. Keep 5 coordination tools and `resultToContent`.

- [ ] **Step 1: Overwrite mcp.ts with slimmed version**

```typescript
// mcp-bridge/src/mcp.ts
import { join, dirname } from "node:path";
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

const __filename = fileURLToPath(import.meta.url);
const PKG_ROOT = join(dirname(__filename), "..");

export async function startMcpServer(dbPath?: string) {
  const resolvedDbPath = dbPath ?? process.env["DB_PATH"] ?? join(PKG_ROOT, "bridge.db");
  const database = createDatabase(resolvedDbPath);
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
```

- [ ] **Step 2: Commit**

```bash
cd /Users/thor/repos/agentic-workflow
git add mcp-bridge/src/mcp.ts
git commit -m "feat: strip memory tools from mcp.ts — 5 coordination tools only"
```

---

### Task 4: Slim index.ts

**Files:**
- Modify: `mcp-bridge/src/index.ts`

Remove all memory DB init, ingestion pipeline, EventBus, sessionQueue, watcher, backfillBridge. Pass db directly to route factories (no eventBus param).

- [ ] **Step 1: Overwrite index.ts with slimmed version**

```typescript
// mcp-bridge/src/index.ts
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import { createDatabase } from "./db/schema.js";
import { createDbClient } from "./db/client.js";
import { createMessageRoutes } from "./routes/messages.js";
import { createTaskRoutes } from "./routes/tasks.js";
import { createConversationRoutes } from "./routes/conversations.js";
import { createServer } from "./server.js";

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

  const messageRoutes = createMessageRoutes(db);
  const taskRoutes = createTaskRoutes(db);
  const conversationRoutes = createConversationRoutes(db);

  const server = createServer([messageRoutes, taskRoutes, conversationRoutes]);

  await server.register(cors, { origin: true });
  await server.listen({ port: PORT, host: HOST });

  console.log(`Bridge server running at http://${HOST}:${PORT}`);
  console.log(`MCP server available via: node dist/mcp.js`);
}

main().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
cd /Users/thor/repos/agentic-workflow
git add mcp-bridge/src/index.ts
git commit -m "feat: strip memory and EventBus setup from index.ts"
```

---

### Task 5: Remove EventBus from controllers and routes

**Files:**
- Modify: `mcp-bridge/src/transport/controllers/message-controller.ts`
- Modify: `mcp-bridge/src/transport/controllers/task-controller.ts`
- Modify: `mcp-bridge/src/routes/messages.ts`
- Modify: `mcp-bridge/src/routes/tasks.ts`

Remove the `EventBus` parameter and all `eventBus.emit()` calls from controllers. Update route factories to match.

- [ ] **Step 1: Overwrite message-controller.ts**

```typescript
// mcp-bridge/src/transport/controllers/message-controller.ts
import type { DbClient } from "../../db/client.js";
import { sendContext } from "../../application/services/send-context.js";
import { getMessagesByConversation, getUnreadMessages } from "../../application/services/get-messages.js";
import type { ApiRequest, ApiResponse } from "../types.js";
import { appErr } from "../types.js";
import type { SendContextSchema, GetMessagesSchema, GetUnreadSchema, MessageResponse } from "../schemas/message-schemas.js";

export function createMessageController(db: DbClient) {
  return {
    async send(
      req: ApiRequest<SendContextSchema>,
    ): Promise<ApiResponse<MessageResponse>> {
      const result = sendContext(db, req.body);
      if (!result.ok) return appErr(result.error);
      return { ok: true, data: result.data };
    },

    async getByConversation(
      req: ApiRequest<GetMessagesSchema>,
    ): Promise<ApiResponse<MessageResponse[]>> {
      const result = getMessagesByConversation(db, req.params.conversation);
      if (!result.ok) return appErr(result.error);
      return { ok: true, data: result.data };
    },

    async getUnread(
      req: ApiRequest<GetUnreadSchema>,
    ): Promise<ApiResponse<MessageResponse[]>> {
      const result = getUnreadMessages(db, req.query.recipient);
      if (!result.ok) return appErr(result.error);
      return { ok: true, data: result.data };
    },
  };
}
```

- [ ] **Step 2: Overwrite task-controller.ts**

```typescript
// mcp-bridge/src/transport/controllers/task-controller.ts
import type { DbClient } from "../../db/client.js";
import { assignTask } from "../../application/services/assign-task.js";
import { reportStatus } from "../../application/services/report-status.js";
import type { ApiRequest, ApiResponse } from "../types.js";
import { appErr } from "../types.js";
import { ERROR_CODE } from "../../application/result.js";
import type {
  AssignTaskSchema,
  GetTaskSchema,
  GetTasksByConversationSchema,
  ReportStatusSchema,
  TaskResponse,
} from "../schemas/task-schemas.js";

export function createTaskController(db: DbClient) {
  return {
    async assign(
      req: ApiRequest<AssignTaskSchema>,
    ): Promise<ApiResponse<TaskResponse>> {
      const result = assignTask(db, req.body);
      if (!result.ok) return appErr(result.error);
      return { ok: true, data: result.data };
    },

    async get(
      req: ApiRequest<GetTaskSchema>,
    ): Promise<ApiResponse<TaskResponse>> {
      const task = db.getTask(req.params.id);
      if (!task) {
        return appErr({
          code: ERROR_CODE.notFound,
          message: `Task ${req.params.id} not found`,
          statusHint: 404,
        });
      }
      return { ok: true, data: task };
    },

    async getByConversation(
      req: ApiRequest<GetTasksByConversationSchema>,
    ): Promise<ApiResponse<TaskResponse[]>> {
      const tasks = db.getTasksByConversation(req.params.conversation);
      return { ok: true, data: tasks };
    },

    async report(
      req: ApiRequest<ReportStatusSchema>,
    ): Promise<ApiResponse<{ message_id: string; task_updated: boolean }>> {
      const result = reportStatus(db, req.body);
      if (!result.ok) return appErr(result.error);
      return { ok: true, data: result.data };
    },
  };
}
```

- [ ] **Step 3: Overwrite routes/messages.ts**

```typescript
// mcp-bridge/src/routes/messages.ts
import type { DbClient } from "../db/client.js";
import { createMessageController } from "../transport/controllers/message-controller.js";
import { defineRoute, type ControllerDefinition, type RouteEntry } from "../transport/types.js";
import {
  SendContextSchema,
  GetMessagesSchema,
  GetUnreadSchema,
} from "../transport/schemas/message-schemas.js";

export function createMessageRoutes(db: DbClient): ControllerDefinition {
  const handlers = createMessageController(db);

  return {
    basePath: "/messages",
    routes: [
      defineRoute({
        method: "POST",
        path: "/send",
        summary: "Send context from one agent to another",
        schema: SendContextSchema,
        handler: handlers.send,
      }),
      defineRoute({
        method: "GET",
        path: "/conversation/:conversation",
        summary: "Get all messages for a conversation",
        schema: GetMessagesSchema,
        handler: handlers.getByConversation,
      }),
      defineRoute({
        method: "GET",
        path: "/unread",
        summary: "Get unread messages for a recipient",
        schema: GetUnreadSchema,
        handler: handlers.getUnread,
      }),
    ] as RouteEntry[],
  };
}
```

- [ ] **Step 4: Overwrite routes/tasks.ts**

```typescript
// mcp-bridge/src/routes/tasks.ts
import type { DbClient } from "../db/client.js";
import { createTaskController } from "../transport/controllers/task-controller.js";
import { defineRoute, type ControllerDefinition, type RouteEntry } from "../transport/types.js";
import {
  AssignTaskSchema,
  GetTaskSchema,
  GetTasksByConversationSchema,
  ReportStatusSchema,
} from "../transport/schemas/task-schemas.js";

export function createTaskRoutes(db: DbClient): ControllerDefinition {
  const handlers = createTaskController(db);

  return {
    basePath: "/tasks",
    routes: [
      defineRoute({
        method: "POST",
        path: "/assign",
        summary: "Assign a task with domain and implementation details",
        schema: AssignTaskSchema,
        handler: handlers.assign,
      }),
      defineRoute({
        method: "GET",
        path: "/:id",
        summary: "Get a task by ID",
        schema: GetTaskSchema,
        handler: handlers.get,
      }),
      defineRoute({
        method: "GET",
        path: "/conversation/:conversation",
        summary: "Get all tasks for a conversation",
        schema: GetTasksByConversationSchema,
        handler: handlers.getByConversation,
      }),
      defineRoute({
        method: "POST",
        path: "/report",
        summary: "Report status back with feedback or completion",
        schema: ReportStatusSchema,
        handler: handlers.report,
      }),
    ] as RouteEntry[],
  };
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/thor/repos/agentic-workflow
git add mcp-bridge/src/transport/controllers/message-controller.ts \
        mcp-bridge/src/transport/controllers/task-controller.ts \
        mcp-bridge/src/routes/messages.ts \
        mcp-bridge/src/routes/tasks.ts
git commit -m "feat: remove EventBus from controllers and routes"
```

---

### Task 6: Update remaining test files

**Files:**
- Modify: `mcp-bridge/tests/helpers.ts`
- Modify: `mcp-bridge/tests/mcp-tools.test.ts`
- Modify: `mcp-bridge/tests/message-controller.test.ts`
- Modify: `mcp-bridge/tests/task-controller.test.ts`
- Modify: `mcp-bridge/tests/routes/messages.test.ts`
- Modify: `mcp-bridge/tests/routes/tasks.test.ts`

- [ ] **Step 1: Overwrite helpers.ts — remove memory helpers**

```typescript
// mcp-bridge/tests/helpers.ts
// Shared test helpers — import these instead of repeating inline setup boilerplate.
import Database from "better-sqlite3";
import { createDbClient, type DbClient } from "../src/db/client.js";
import { MIGRATIONS } from "../src/db/schema.js";

/**
 * Creates an in-memory bridge database with all production pragmas applied.
 * Returns both the typed DbClient and the raw Database instance.
 */
export function createTestBridgeDb(): { db: DbClient; raw: Database.Database } {
  const raw = new Database(":memory:");
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  raw.pragma("busy_timeout = 5000");
  raw.exec(MIGRATIONS);
  const db = createDbClient(raw);
  return { db, raw };
}
```

- [ ] **Step 2: Overwrite mcp-tools.test.ts — remove 6 memory tool test suites**

```typescript
// mcp-bridge/tests/mcp-tools.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { type DbClient } from "../src/db/client.js";
import { sendContext } from "../src/application/services/send-context.js";
import { getMessagesByConversation, getUnreadMessages } from "../src/application/services/get-messages.js";
import { assignTask } from "../src/application/services/assign-task.js";
import { reportStatus } from "../src/application/services/report-status.js";
import { randomUUID } from "node:crypto";
import { createTestBridgeDb } from "./helpers.js";

// NOTE: resultToContent below mirrors the private helper in mcp.ts.
// Both implementations must remain in sync. If you change the formatting
// logic in mcp.ts, update this copy (and vice versa).
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

let db: DbClient;

beforeEach(() => {
  ({ db } = createTestBridgeDb());
});

describe("resultToContent", () => {
  it("formats success result as JSON text", () => {
    const result = resultToContent({ ok: true as const, data: { id: "123" } });
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text)).toEqual({ id: "123" });
    expect(result).not.toHaveProperty("isError");
  });

  it("formats error result with code and message", () => {
    const result = resultToContent({ ok: false as const, error: { code: "NOT_FOUND", message: "Gone" } });
    expect(result.content[0].text).toBe("Error [NOT_FOUND]: Gone");
    expect(result.isError).toBe(true);
  });
});

describe("send_context tool", () => {
  it("creates a message via sendContext service", () => {
    const conv = randomUUID();
    const result = sendContext(db, { conversation: conv, sender: "claude", recipient: "codex", payload: "hello" });
    const content = resultToContent(result);
    expect(content).not.toHaveProperty("isError");
    const data = JSON.parse(content.content[0].text);
    expect(data.conversation).toBe(conv);
  });
});

describe("get_messages tool", () => {
  it("retrieves messages for a conversation", () => {
    const conv = randomUUID();
    sendContext(db, { conversation: conv, sender: "a", recipient: "b", payload: "msg" });
    const result = getMessagesByConversation(db, conv);
    const content = resultToContent(result);
    const data = JSON.parse(content.content[0].text);
    expect(data).toHaveLength(1);
  });
});

describe("get_unread tool", () => {
  it("returns unread and marks them read", () => {
    sendContext(db, { conversation: randomUUID(), sender: "a", recipient: "bob", payload: "msg" });
    const result = getUnreadMessages(db, "bob");
    const content = resultToContent(result);
    const data = JSON.parse(content.content[0].text);
    expect(data).toHaveLength(1);

    const result2 = getUnreadMessages(db, "bob");
    const data2 = JSON.parse(resultToContent(result2).content[0].text);
    expect(data2).toHaveLength(0);
  });
});

describe("assign_task tool", () => {
  it("creates a task", () => {
    const conv = randomUUID();
    const result = assignTask(db, { conversation: conv, domain: "backend", summary: "Fix", details: "Details" });
    const content = resultToContent(result);
    const data = JSON.parse(content.content[0].text);
    expect(data.status).toBe("pending");
  });
});

describe("report_status tool", () => {
  it("updates task status", () => {
    const conv = randomUUID();
    const taskResult = assignTask(db, { conversation: conv, domain: "x", summary: "s", details: "d" });
    if (!taskResult.ok) return;
    const result = reportStatus(db, {
      conversation: conv, sender: "codex", recipient: "claude",
      task_id: taskResult.data.id, status: "completed", payload: "Done",
    });
    const content = resultToContent(result);
    const data = JSON.parse(content.content[0].text);
    expect(data.task_updated).toBe(true);
  });
});
```

- [ ] **Step 3: Overwrite message-controller.test.ts — remove EventBus import, setup, and event assertions**

```typescript
// mcp-bridge/tests/message-controller.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { type DbClient } from "../src/db/client.js";
import { createMessageController } from "../src/transport/controllers/message-controller.js";
import * as sendContextService from "../src/application/services/send-context.js";
import * as getMessagesService from "../src/application/services/get-messages.js";
import { err } from "../src/application/result.js";
import { randomUUID } from "node:crypto";
import { createTestBridgeDb } from "./helpers.js";

let db: DbClient;
let controller: ReturnType<typeof createMessageController>;

beforeEach(() => {
  ({ db } = createTestBridgeDb());
  controller = createMessageController(db);
});

describe("send error path", () => {
  it("returns error when sendContext service fails", async () => {
    vi.spyOn(sendContextService, "sendContext").mockReturnValueOnce(
      err({ code: "INTERNAL_ERROR", message: "DB failure", statusHint: 500 }),
    );
    const result = await controller.send({
      body: { conversation: randomUUID(), sender: "claude", recipient: "codex", payload: "hello" },
      params: undefined as never,
      query: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INTERNAL_ERROR");
    vi.restoreAllMocks();
  });
});

describe("getByConversation error path", () => {
  it("returns error when getMessagesByConversation service fails", async () => {
    vi.spyOn(getMessagesService, "getMessagesByConversation").mockReturnValueOnce(
      err({ code: "INTERNAL_ERROR", message: "DB failure", statusHint: 500 }),
    );
    const result = await controller.getByConversation({
      params: { conversation: randomUUID() },
      body: undefined as never,
      query: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INTERNAL_ERROR");
    vi.restoreAllMocks();
  });
});

describe("getUnread error path", () => {
  it("returns error when getUnreadMessages service fails", async () => {
    vi.spyOn(getMessagesService, "getUnreadMessages").mockReturnValueOnce(
      err({ code: "INTERNAL_ERROR", message: "DB failure", statusHint: 500 }),
    );
    const result = await controller.getUnread({
      query: { recipient: "bob" },
      body: undefined as never,
      params: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INTERNAL_ERROR");
    vi.restoreAllMocks();
  });
});

describe("send", () => {
  it("creates a message and returns it", async () => {
    const conv = randomUUID();
    const result = await controller.send({
      body: { conversation: conv, sender: "claude", recipient: "codex", payload: "hello", meta_prompt: "analyze" },
      params: undefined as never,
      query: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversation).toBe(conv);
    expect(result.data.sender).toBe("claude");
    expect(result.data.kind).toBe("context");
  });
});

describe("getByConversation", () => {
  it("returns messages for a conversation", async () => {
    const conv = randomUUID();
    db.insertMessage({ conversation: conv, sender: "a", recipient: "b", kind: "context", payload: "msg", meta_prompt: null });
    const result = await controller.getByConversation({
      params: { conversation: conv },
      body: undefined as never,
      query: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
  });

  it("returns empty array for unknown conversation", async () => {
    const result = await controller.getByConversation({
      params: { conversation: randomUUID() },
      body: undefined as never,
      query: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(0);
  });
});

describe("getUnread", () => {
  it("returns unread messages and marks them read", async () => {
    const conv = randomUUID();
    db.insertMessage({ conversation: conv, sender: "a", recipient: "bob", kind: "context", payload: "msg", meta_prompt: null });
    const first = await controller.getUnread({
      query: { recipient: "bob" },
      body: undefined as never,
      params: undefined as never,
      requestId: "test",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data).toHaveLength(1);

    const second = await controller.getUnread({
      query: { recipient: "bob" },
      body: undefined as never,
      params: undefined as never,
      requestId: "test",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Overwrite task-controller.test.ts — remove EventBus import, setup, and event assertions**

```typescript
// mcp-bridge/tests/task-controller.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { type DbClient } from "../src/db/client.js";
import { createTaskController } from "../src/transport/controllers/task-controller.js";
import * as assignTaskService from "../src/application/services/assign-task.js";
import { err } from "../src/application/result.js";
import { randomUUID } from "node:crypto";
import { createTestBridgeDb } from "./helpers.js";

let db: DbClient;
let controller: ReturnType<typeof createTaskController>;

beforeEach(() => {
  ({ db } = createTestBridgeDb());
  controller = createTaskController(db);
});

describe("assign error path", () => {
  it("returns error when assignTask service fails", async () => {
    vi.spyOn(assignTaskService, "assignTask").mockReturnValueOnce(
      err({ code: "INTERNAL_ERROR", message: "DB failure", statusHint: 500 }),
    );
    const result = await controller.assign({
      body: { conversation: randomUUID(), domain: "backend", summary: "Fix bug", details: "JWT broken", assigned_to: "codex" },
      params: undefined as never,
      query: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INTERNAL_ERROR");
    vi.restoreAllMocks();
  });
});

describe("assign", () => {
  it("creates a task and returns it", async () => {
    const conv = randomUUID();
    const result = await controller.assign({
      body: { conversation: conv, domain: "backend", summary: "Fix bug", details: "JWT broken", assigned_to: "codex" },
      params: undefined as never,
      query: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.domain).toBe("backend");
    expect(result.data.status).toBe("pending");
  });
});

describe("get", () => {
  it("returns a task by id", async () => {
    const task = db.insertTask({ conversation: randomUUID(), domain: "x", summary: "s", details: "d", analysis: null, assigned_to: null });
    const result = await controller.get({
      params: { id: task.id },
      body: undefined as never,
      query: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toBe(task.id);
  });

  it("returns NOT_FOUND for non-existent task", async () => {
    const result = await controller.get({
      params: { id: randomUUID() },
      body: undefined as never,
      query: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("getByConversation", () => {
  it("returns tasks for a conversation", async () => {
    const conv = randomUUID();
    db.insertTask({ conversation: conv, domain: "x", summary: "s", details: "d", analysis: null, assigned_to: null });
    const result = await controller.getByConversation({
      params: { conversation: conv },
      body: undefined as never,
      query: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
  });
});

describe("report", () => {
  it("creates status message and updates task when task_id provided", async () => {
    const conv = randomUUID();
    const task = db.insertTask({ conversation: conv, domain: "x", summary: "s", details: "d", analysis: null, assigned_to: null });
    const result = await controller.report({
      body: { conversation: conv, sender: "codex", recipient: "claude", task_id: task.id, status: "completed", payload: "Done" },
      params: undefined as never,
      query: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.task_updated).toBe(true);
  });

  it("does not update task when no task_id provided", async () => {
    const conv = randomUUID();
    const result = await controller.report({
      body: { conversation: conv, sender: "codex", recipient: "claude", status: "completed", payload: "Done" },
      params: undefined as never,
      query: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.task_updated).toBe(false);
  });

  it("returns NOT_FOUND for non-existent task_id", async () => {
    const conv = randomUUID();
    const result = await controller.report({
      body: { conversation: conv, sender: "codex", recipient: "claude", task_id: randomUUID(), status: "completed", payload: "Done" },
      params: undefined as never,
      query: undefined as never,
      requestId: "test",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});
```

- [ ] **Step 5: Update routes/messages.test.ts — remove EventBus import and instantiation**

In `mcp-bridge/tests/routes/messages.test.ts`, remove the `createEventBus` import and the `const eventBus = createEventBus()` line. Change `createMessageRoutes(db, eventBus)` to `createMessageRoutes(db)`.

Read the file first, then apply the three edits:
1. Remove `import { createEventBus } from "../../src/application/events.js";`
2. Remove `const eventBus = createEventBus();`
3. Change `createMessageRoutes(db, eventBus)` → `createMessageRoutes(db)`

- [ ] **Step 6: Update routes/tasks.test.ts — remove EventBus import and instantiation**

Same pattern as Step 5 but for `mcp-bridge/tests/routes/tasks.test.ts`:
1. Remove `import { createEventBus } from "../../src/application/events.js";`
2. Remove `const eventBus = createEventBus();`
3. Change `createTaskRoutes(db, eventBus)` → `createTaskRoutes(db)`

- [ ] **Step 7: Commit**

```bash
cd /Users/thor/repos/agentic-workflow
git add mcp-bridge/tests/
git commit -m "test: remove memory test helpers and EventBus from controller/route tests"
```

---

### Task 7: Build, run tests, and update new baseline

- [ ] **Step 1: Run TypeScript build**

```bash
cd /Users/thor/repos/agentic-workflow/mcp-bridge && npm run build
```

Expected: zero errors. If TypeScript reports errors, they will be stale imports — fix the specific import at the reported line.

- [ ] **Step 2: Run tests and capture new count**

```bash
cd /Users/thor/repos/agentic-workflow/mcp-bridge && npm test 2>&1 | tail -20
```

Expected: all tests pass. Note the final test count (e.g. `X tests passed`).

- [ ] **Step 3: Commit if clean**

```bash
cd /Users/thor/repos/agentic-workflow
git add -A
git commit -m "build: verify bridge compiles and tests pass after memory layer removal"
```

---

### Task 8: Remove dependencies, UI, and config artifacts

**Files:**
- Modify: `mcp-bridge/package.json`
- Delete: `ui/` (entire directory)
- Delete: `start.sh`
- Delete: `config/hooks/bridge-context.sh`
- Modify: `setup.sh`

- [ ] **Step 1: Remove unused npm dependencies**

In `mcp-bridge/package.json`, remove `@huggingface/transformers` and `sqlite-vec` from `dependencies`:

```json
"dependencies": {
  "@fastify/cors": "^11.2.0",
  "@modelcontextprotocol/sdk": "^1.12.1",
  "better-sqlite3": "^11.7.0",
  "fastify": "^5.2.1",
  "zod": "^3.24.2"
}
```

Then run:

```bash
cd /Users/thor/repos/agentic-workflow/mcp-bridge && npm install
```

- [ ] **Step 2: Delete UI, start.sh, bridge-context.sh**

```bash
cd /Users/thor/repos/agentic-workflow
rm -rf ui/
rm start.sh
rm config/hooks/bridge-context.sh
```

- [ ] **Step 3: Update setup.sh — remove bridge-context install block and UI section**

In `setup.sh`, make these two edits:

**Edit A** — Remove the bridge-context SessionStart hook installation block (approximately lines 257–268). Remove these lines entirely:
```bash
  # Add bridge-context SessionStart hook if not already present
  if ! jq -e '.hooks.SessionStart[]? | select(.hooks[]?.command | test("bridge-context"))' "$SETTINGS_FILE" &>/dev/null; then
    if jq -e 'has("hooks") and (.hooks | has("SessionStart"))' "$SETTINGS_FILE" &>/dev/null; then
      jq --argjson entry '{"hooks":[{"type":"command","command":"~/.claude/hooks/bridge-context.sh"}]}' '.hooks.SessionStart += [$entry]' \
        "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" \
        && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    else
      jq --argjson entries '[{"hooks":[{"type":"command","command":"~/.claude/hooks/bridge-context.sh"}]}]' '.hooks.SessionStart = $entries' \
        "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" \
        && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    fi
    echo "  hooks.SessionStart: bridge-context added"
  fi
```

Also add a cleanup line immediately before where that block was, to prune the stale hook from existing settings.json installations:
```bash
  # Remove legacy bridge-context SessionStart hook if present
  if jq -e '.hooks.SessionStart[]? | select(.hooks[]?.command | test("bridge-context"))' "$SETTINGS_FILE" &>/dev/null; then
    jq '.hooks.SessionStart = [.hooks.SessionStart[]? | select(.hooks[]?.command | (test("bridge-context") | not))]' \
      "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    echo "  hooks.SessionStart: removed legacy bridge-context hook"
  fi
```

**Edit B** — Remove the UI installation section (approximately lines 409–419):
```bash
# --- UI ---

echo "Installing UI dependencies..."

UI_DIR="$SCRIPT_DIR/ui"

if [ -f "$UI_DIR/package.json" ]; then
  (cd "$UI_DIR" && npm install)
  echo "  UI: dependencies installed"
else
  echo "  UI: package.json not found, skipping"
fi
```

- [ ] **Step 4: Commit**

```bash
cd /Users/thor/repos/agentic-workflow
git add -A
git commit -m "chore: remove UI, start.sh, bridge-context hook, and unused deps"
```

---

### Task 9: Update planning docs

**Files:**
- Modify: `planning/ARCHITECTURE.md`
- Modify: `planning/API_CONTRACT.md`
- Modify: `planning/ERD.md`
- Modify: `planning/TESTING.md`
- Modify: `planning/DEPENDENCY_GRAPH.md`
- Modify: `planning/COMPETITIVE_ANALYSIS.md`
- Modify: `planning/PRODUCT_ROADMAP.md`
- Modify: `planning/LOCAL_DEV.md`

For each doc, read the current file, then remove or update all references to the removed components. Key removals per file:

| Doc | Remove / Replace |
|-----|-----------------|
| `ARCHITECTURE.md` | Dual-database section, memory graph diagram, ingestion pipeline, embedding service, SSE stream, UI section |
| `API_CONTRACT.md` | Entire `/memory/*` endpoint section (search, traverse, context, nodes, links, logs, topics, stats, ingest) |
| `ERD.md` | Memory DB section: `nodes`, `edges`, `node_embeddings`, `nodes_fts`, `ingestion_cursors`, `traversal_logs` tables |
| `TESTING.md` | Memory/ingestion test patterns, `createTestMemoryDb`/`createMockEmbeddingService` helper docs, update test count to actual post-removal baseline |
| `DEPENDENCY_GRAPH.md` | `sqlite-vec`, `@huggingface/transformers`, `sqlite-vec.load()`, memory DB references |
| `COMPETITIVE_ANALYSIS.md` | Update the feature comparison table — mark memory/graph as "delegated to prism-mcp" instead of ✓ |
| `PRODUCT_ROADMAP.md` | Remove/cross-out memory-related roadmap items (ingestion improvements, graph expansion, etc.) |
| `LOCAL_DEV.md` | Remove memory DB startup step, UI startup step (`cd ui && npm run dev`), `start.sh` reference |

- [ ] **Step 1: Read and update each doc in sequence**

Read each file fully before editing. Make targeted removals — do not rewrite sections unrelated to memory or UI.

- [ ] **Step 2: Commit all doc updates together**

```bash
cd /Users/thor/repos/agentic-workflow
git add planning/
git commit -m "docs: remove memory layer references from planning docs"
```

---

### Task 10: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read CLAUDE.md and apply these targeted edits**

1. **Directory structure** — remove `ui/` row and `start.sh` from the Commands section
2. **Commands section** — remove the UI block:
   ```bash
   # UI Dashboard
   cd ui && npm test
   cd ui && npm run test:coverage
   ```
   Remove `./start.sh` and its comment
3. **Merge Gate** — update the test count line from `341 bridge + 67 UI` to the actual count from Task 7 Step 2 (bridge only, e.g. `~120 bridge`)
4. **Tech Stack** — remove the UI row (`Next.js 15 App Router`)

- [ ] **Step 2: Commit**

```bash
cd /Users/thor/repos/agentic-workflow
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md — remove UI, start.sh, update test baseline"
```

---

### Task 11: Final verification

- [ ] **Step 1: Clean build**

```bash
cd /Users/thor/repos/agentic-workflow/mcp-bridge && npm run build && npm test
```

Expected: zero TypeScript errors, all tests pass.

- [ ] **Step 2: Smoke-test the bridge starts**

```bash
cd /Users/thor/repos/agentic-workflow/mcp-bridge && node dist/index.js &
sleep 2
curl -sf http://localhost:3100/health
kill %1
```

Expected: `{"status":"ok"}`

- [ ] **Step 3: Verify no stale references to removed modules**

```bash
cd /Users/thor/repos/agentic-workflow/mcp-bridge
grep -r "memory-client\|memory-schema\|ingestion\|EventBus\|createEventBus\|sqlite-vec\|huggingface" src/ tests/ --include="*.ts"
```

Expected: no output.

- [ ] **Step 4: Final commit if any loose ends**

```bash
cd /Users/thor/repos/agentic-workflow
git add -A
git commit -m "chore: final cleanup after prism specialization split" 2>/dev/null || echo "nothing to commit"
```
