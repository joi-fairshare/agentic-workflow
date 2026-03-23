// mcp-bridge/tests/ingest-bridge.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { type MemoryDbClient } from "../src/db/memory-client.js";
import { type DbClient } from "../src/db/client.js";
import { createSecretFilter } from "../src/ingestion/secret-filter.js";
import { ingestBridgeMessage, ingestBridgeTask, backfillBridge, normalizeRepoSlug } from "../src/application/services/ingest-bridge.js";
import { sendContext } from "../src/application/services/send-context.js";
import { assignTask } from "../src/application/services/assign-task.js";
import { randomUUID } from "node:crypto";
import { createTestBridgeDb, createTestMemoryDb } from "./helpers.js";

let mdb: MemoryDbClient;
let bridgeDb: DbClient;
const filter = createSecretFilter();
const repo = "test-repo";

beforeEach(() => {
  ({ mdb } = createTestMemoryDb());
  ({ db: bridgeDb } = createTestBridgeDb());
});

describe("ingestBridgeMessage", () => {
  it("creates a message node and conversation node with contains edge", () => {
    const conv = randomUUID();
    const msgResult = sendContext(bridgeDb, {
      conversation: conv,
      sender: "claude",
      recipient: "codex",
      payload: "Hello from bridge",
    });
    if (!msgResult.ok) return;

    const result = ingestBridgeMessage(mdb, filter, repo, msgResult.data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.kind).toBe("message");
    expect(result.data.sender).toBe("claude");

    const convNode = mdb.getNodeBySource("bridge-conversation", conv);
    expect(convNode).toBeDefined();

    const edges = mdb.getEdgesFrom(convNode!.id);
    expect(edges.some((e) => e.kind === "contains" && e.to_node === result.data.id)).toBe(true);
  });

  it("is idempotent — ingesting same message twice creates only one node", () => {
    const conv = randomUUID();
    const msgResult = sendContext(bridgeDb, { conversation: conv, sender: "a", recipient: "b", payload: "test" });
    if (!msgResult.ok) return;

    ingestBridgeMessage(mdb, filter, repo, msgResult.data);
    ingestBridgeMessage(mdb, filter, repo, msgResult.data);

    const node = mdb.getNodeBySource("bridge", msgResult.data.id);
    expect(node).toBeDefined();
    const allMessages = mdb.getNodesByRepoAndKind(repo, "message");
    expect(allMessages.filter((n) => n.source_id === msgResult.data.id)).toHaveLength(1);
  });

  it("redacts secrets from message body", () => {
    const conv = randomUUID();
    const msgResult = sendContext(bridgeDb, {
      conversation: conv,
      sender: "a",
      recipient: "b",
      payload: "Use key AKIAIOSFODNN7EXAMPLE",
    });
    if (!msgResult.ok) return;

    const result = ingestBridgeMessage(mdb, filter, repo, msgResult.data);
    if (!result.ok) return;
    expect(result.data.body).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(result.data.body).toContain("[REDACTED]");
  });
});

describe("ingestBridgeTask", () => {
  it("creates a task node with spawned edge from conversation", () => {
    const conv = randomUUID();
    const taskResult = assignTask(bridgeDb, {
      conversation: conv,
      domain: "backend",
      summary: "Fix auth",
      details: "JWT missing",
      assigned_to: "codex",
    });
    if (!taskResult.ok) return;

    const result = ingestBridgeTask(mdb, filter, repo, taskResult.data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.kind).toBe("task");
    expect(result.data.sender).toBe("codex");

    const convNode = mdb.getNodeBySource("bridge-conversation", conv);
    expect(convNode).toBeDefined();

    const edges = mdb.getEdgesFrom(convNode!.id);
    expect(edges.some((e) => e.kind === "spawned")).toBe(true);
  });

  it("is idempotent — ingesting same task twice returns existing node", () => {
    const conv = randomUUID();
    const taskResult = assignTask(bridgeDb, {
      conversation: conv,
      domain: "frontend",
      summary: "Fix UI",
      details: "Button broken",
      assigned_to: "agent",
    });
    if (!taskResult.ok) return;

    ingestBridgeTask(mdb, filter, repo, taskResult.data);
    const result2 = ingestBridgeTask(mdb, filter, repo, taskResult.data);

    expect(result2.ok).toBe(true);
    const allTasks = mdb.getNodesByRepoAndKind(repo, "task");
    expect(allTasks.filter((n) => n.source_id === taskResult.data.id)).toHaveLength(1);
  });
});

describe("backfillBridge", () => {
  it("ingests all existing bridge messages", async () => {
    const conv = randomUUID();
    sendContext(bridgeDb, { conversation: conv, sender: "a", recipient: "b", payload: "msg1" });
    sendContext(bridgeDb, { conversation: conv, sender: "b", recipient: "a", payload: "msg2" });

    const result = await backfillBridge(mdb, bridgeDb, filter, repo);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.messages_ingested).toBe(2);

    const cursor = mdb.getCursor("bridge-backfill", repo);
    expect(cursor).toBeDefined();
  });

  it("ingests tasks from backfill", async () => {
    const conv = randomUUID();
    assignTask(bridgeDb, {
      conversation: conv,
      domain: "backend",
      summary: "Backfill task",
      details: "Task details",
      assigned_to: "agent",
    });

    const result = await backfillBridge(mdb, bridgeDb, filter, repo);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.tasks_ingested).toBe(1);
  });
});

describe("normalizeRepoSlug", () => {
  it("normalizes SSH git URLs", () => {
    expect(normalizeRepoSlug("git@github.com:org/repo.git")).toBe("org-repo");
  });

  it("normalizes HTTPS git URLs", () => {
    expect(normalizeRepoSlug("https://github.com/org/repo.git")).toBe("org-repo");
    expect(normalizeRepoSlug("https://github.com/org/repo")).toBe("org-repo");
  });

  it("falls back to directory name", () => {
    expect(normalizeRepoSlug("/Users/dev/my-project")).toBe("my-project");
  });
});
