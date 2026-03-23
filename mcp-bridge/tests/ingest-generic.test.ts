import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { MEMORY_MIGRATIONS } from "../src/db/memory-schema.js";
import { createMemoryDbClient, type MemoryDbClient } from "../src/db/memory-client.js";
import { createSecretFilter } from "../src/ingestion/secret-filter.js";
import { ingestGenericChat } from "../src/application/services/ingest-generic.js";

describe("ingestGenericChat", () => {
  let mdb: MemoryDbClient;
  const filter = createSecretFilter();

  beforeEach(() => {
    const raw = new Database(":memory:");
    sqliteVec.load(raw);
    raw.pragma("journal_mode = WAL");
    raw.exec(MEMORY_MIGRATIONS);
    mdb = createMemoryDbClient(raw);
  });

  it("creates conversation + message nodes with correct senders", () => {
    const result = ingestGenericChat(mdb, filter, {
      repo: "r",
      sessionId: "sess-1",
      sessionTitle: "Test Chat",
      messages: [
        { role: "user", content: "Hello", timestamp: "2026-01-01T00:00:00Z" },
        { role: "assistant", content: "Hi there", timestamp: "2026-01-01T00:00:01Z" },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.messages_ingested).toBe(2);
    expect(result.data.edges_created).toBe(3); // 2 contains + 1 reply_to

    const conv = mdb.getNodeBySource("generic-session", "sess-1");
    expect(conv).not.toBeNull();
    expect(conv!.kind).toBe("conversation");

    const nodes = mdb.getNodesByRepo("r", 100, 0);
    const messages = nodes.filter(n => n.kind === "message");
    const senders = messages.map(m => m.sender).sort();
    expect(senders).toEqual(["assistant", "user"]);
  });

  it("is idempotent — skips already-ingested sessions", () => {
    const input = {
      repo: "r", sessionId: "sess-1", sessionTitle: "Test",
      messages: [{ role: "user", content: "Hi" }],
    };

    ingestGenericChat(mdb, filter, input);
    const result = ingestGenericChat(mdb, filter, input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.messages_ingested).toBe(0);
    expect(result.data.skipped).toBe(1);
  });

  it("creates reply_to edges between consecutive messages", () => {
    ingestGenericChat(mdb, filter, {
      repo: "r", sessionId: "s", sessionTitle: "T",
      messages: [
        { role: "user", content: "Q1" },
        { role: "assistant", content: "A1" },
        { role: "user", content: "Q2" },
      ],
    });

    const nodes = mdb.getNodesByRepo("r", 100, 0).filter(n => n.kind === "message");
    // Find nodes by their body content
    const q1 = nodes.find(n => n.body === "Q1")!;
    const a1 = nodes.find(n => n.body === "A1")!;
    const q2 = nodes.find(n => n.body === "Q2")!;
    expect(q1).toBeDefined();
    expect(a1).toBeDefined();
    expect(q2).toBeDefined();

    // A1 has reply_to edge pointing to Q1
    const a1Edges = mdb.getEdgesFrom(a1.id);
    expect(a1Edges.some(e => e.kind === "reply_to" && e.to_node === q1.id)).toBe(true);
    // Q2 has reply_to edge pointing to A1
    const q2Edges = mdb.getEdgesFrom(q2.id);
    expect(q2Edges.some(e => e.kind === "reply_to" && e.to_node === a1.id)).toBe(true);
  });

  it("applies secret filter to content", () => {
    ingestGenericChat(mdb, filter, {
      repo: "r", sessionId: "s", sessionTitle: "T",
      messages: [{ role: "user", content: "my key is AKIAIOSFODNN7EXAMPLE" }],
    });

    const nodes = mdb.getNodesByRepo("r", 100, 0).filter(n => n.kind === "message");
    expect(nodes[0].body).toContain("[REDACTED]");
    expect(nodes[0].body).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });
});
