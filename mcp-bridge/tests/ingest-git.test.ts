// mcp-bridge/tests/ingest-git.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { createMemoryDbClient, type MemoryDbClient } from "../src/db/memory-client.js";
import { MEMORY_MIGRATIONS } from "../src/db/memory-schema.js";
import { createSecretFilter } from "../src/ingestion/secret-filter.js";
import { ingestGitMetadata, type IngestGitInput } from "../src/application/services/ingest-git.js";

// ── Mock child_process ─────────────────────────────────────────────────

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  statSync: vi.fn(() => ({ isDirectory: () => true })),
}));

import { execFileSync } from "node:child_process";
const mockExecFileSync = vi.mocked(execFileSync);

// ── Test setup ──────────────────────────────────────────────────────────

let mdb: MemoryDbClient;
const filter = createSecretFilter();
const repo = "test-repo";
const repoPath = "/tmp/test-repo";

const baseInput: IngestGitInput = { repo, repoPath };

function makeGitLogOutput(...commits: Array<{ sha: string; subject: string; author: string; date: string }>): string {
  return commits.map((c) => `${c.sha}|${c.subject}|${c.author}|${c.date}`).join("\n");
}

function makeGhPrOutput(prs: Array<{ number: number; title: string; author: string; state: string; createdAt: string; body: string }>): string {
  return JSON.stringify(prs.map((p) => ({ ...p, author: { login: p.author } })));
}

beforeEach(() => {
  const raw = new Database(":memory:");
  sqliteVec.load(raw);
  raw.pragma("journal_mode = WAL");
  raw.exec(MEMORY_MIGRATIONS);
  mdb = createMemoryDbClient(raw);
  vi.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────

describe("ingestGitMetadata", () => {
  it("parses git log output and creates artifact nodes for each commit", async () => {
    mockExecFileSync.mockImplementation((cmd: unknown, args: unknown) => {
      const c = cmd as string;
      const a = args as string[];
      if (c === "git" && a[0] === "log") {
        return makeGitLogOutput(
          { sha: "abc1234", subject: "feat: add login", author: "Alice", date: "2026-03-18T10:00:00+00:00" },
          { sha: "def5678", subject: "fix: typo", author: "Bob", date: "2026-03-17T09:00:00+00:00" },
        );
      }
      if (c === "gh" && a[0] === "pr") {
        return makeGhPrOutput([]);
      }
      return "";
    });

    const result = await ingestGitMetadata(mdb, filter, baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.commits_ingested).toBe(2);

    const commit1 = mdb.getNodeBySource("git", "abc1234");
    expect(commit1).toBeDefined();
    expect(commit1!.kind).toBe("artifact");
    expect(commit1!.title).toContain("feat: add login");

    const commit2 = mdb.getNodeBySource("git", "def5678");
    expect(commit2).toBeDefined();
    expect(commit2!.kind).toBe("artifact");
  });

  it("creates references edges when a message body contains a commit SHA", async () => {
    mockExecFileSync.mockImplementation((cmd: unknown, args: unknown) => {
      const c = cmd as string;
      const a = args as string[];
      if (c === "git" && a[0] === "log") {
        return makeGitLogOutput(
          { sha: "abc1234def56789", subject: "fix: something", author: "Alice", date: "2026-03-18T10:00:00+00:00" },
        );
      }
      if (c === "gh" && a[0] === "pr") return makeGhPrOutput([]);
      return "";
    });

    // Insert a message node referencing the commit SHA (7+ chars)
    mdb.insertNode({
      repo,
      kind: "message",
      title: "Code review",
      body: "I reviewed abc1234d and it looks good.",
      meta: "{}",
      source_id: "msg-1",
      source_type: "test",
    });

    const result = await ingestGitMetadata(mdb, filter, baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.references_created).toBeGreaterThanOrEqual(1);

    const commitNode = mdb.getNodeBySource("git", "abc1234def56789");
    expect(commitNode).toBeDefined();

    // Find the message node
    const msgNode = mdb.getNodeBySource("test", "msg-1");
    expect(msgNode).toBeDefined();

    // There should be a references edge from message → commit
    const edges = mdb.getEdgesFrom(msgNode!.id);
    const refEdge = edges.find((e) => e.kind === "references" && e.to_node === commitNode!.id);
    expect(refEdge).toBeDefined();
  });

  it("creates references edges when a message body contains a PR ref (#123)", async () => {
    mockExecFileSync.mockImplementation((cmd: unknown, args: unknown) => {
      const c = cmd as string;
      const a = args as string[];
      if (c === "git" && a[0] === "log") return makeGitLogOutput();
      if (c === "gh" && a[0] === "pr") {
        return makeGhPrOutput([
          { number: 42, title: "Add OAuth", author: "carol", state: "merged", createdAt: "2026-03-15T08:00:00Z", body: "Implements OAuth 2.0" },
        ]);
      }
      return "";
    });

    // Insert a message that references PR #42
    mdb.insertNode({
      repo,
      kind: "message",
      title: "PR review",
      body: "I reviewed PR #42 and it looks good.",
      meta: "{}",
      source_id: "msg-pr-ref",
      source_type: "test",
    });

    const result = await ingestGitMetadata(mdb, filter, baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.prs_ingested).toBe(1);
    expect(result.data.references_created).toBeGreaterThanOrEqual(1);

    const prNode = mdb.getNodeBySource("github_pr", "#42");
    expect(prNode).toBeDefined();

    const msgNode = mdb.getNodeBySource("test", "msg-pr-ref");
    expect(msgNode).toBeDefined();

    const edges = mdb.getEdgesFrom(msgNode!.id);
    const refEdge = edges.find((e) => e.kind === "references" && e.to_node === prNode!.id);
    expect(refEdge).toBeDefined();
  });

  it("is idempotent — re-ingesting same commits creates no duplicates", async () => {
    mockExecFileSync.mockImplementation((cmd: unknown, args: unknown) => {
      const c = cmd as string;
      const a = args as string[];
      if (c === "git" && a[0] === "log") {
        return makeGitLogOutput(
          { sha: "aabbcc1", subject: "feat: initial", author: "Alice", date: "2026-03-18T10:00:00+00:00" },
        );
      }
      if (c === "gh" && a[0] === "pr") return makeGhPrOutput([]);
      return "";
    });

    await ingestGitMetadata(mdb, filter, baseInput);
    const result2 = await ingestGitMetadata(mdb, filter, baseInput);

    expect(result2.ok).toBe(true);
    if (!result2.ok) return;

    // Second run should not create duplicates
    const allArtifacts = mdb.getNodesByRepoAndKind(repo, "artifact");
    expect(allArtifacts.filter((n) => n.source_id === "aabbcc1")).toHaveLength(1);
  });

  it("handles missing gh CLI gracefully — skips PR ingestion and returns partial result", async () => {
    mockExecFileSync.mockImplementation((cmd: unknown, args: unknown) => {
      const c = cmd as string;
      const a = args as string[];
      if (c === "git" && a[0] === "log") {
        return makeGitLogOutput(
          { sha: "abc1234", subject: "fix: bug", author: "Alice", date: "2026-03-18T10:00:00+00:00" },
        );
      }
      if (c === "gh" && a[0] === "pr") {
        throw new Error("gh: command not found");
      }
      return "";
    });

    const result = await ingestGitMetadata(mdb, filter, baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.commits_ingested).toBe(1);
    expect(result.data.prs_ingested).toBe(0);
  });

  it("advances the cursor after successful ingestion", async () => {
    mockExecFileSync.mockImplementation((cmd: unknown, args: unknown) => {
      const c = cmd as string;
      const a = args as string[];
      if (c === "git" && a[0] === "log") {
        return makeGitLogOutput(
          { sha: "sha111aaa", subject: "feat: x", author: "Alice", date: "2026-03-18T10:00:00+00:00" },
          { sha: "sha222bbb", subject: "feat: y", author: "Bob", date: "2026-03-17T09:00:00+00:00" },
        );
      }
      if (c === "gh" && a[0] === "pr") return makeGhPrOutput([]);
      return "";
    });

    const cursorBefore = mdb.getCursor("git-ingest", repo);
    expect(cursorBefore).toBeUndefined();

    await ingestGitMetadata(mdb, filter, baseInput);

    const cursorAfter = mdb.getCursor("git-ingest", repo);
    expect(cursorAfter).toBeDefined();
    // Cursor should be the first (most recent) commit date
    expect(cursorAfter).toBe("2026-03-18T10:00:00+00:00");
  });

  it("filters commit messages through SecretFilter before storing", async () => {
    mockExecFileSync.mockImplementation((cmd: unknown, args: unknown) => {
      const c = cmd as string;
      const a = args as string[];
      if (c === "git" && a[0] === "log") {
        return makeGitLogOutput(
          { sha: "abc1234", subject: "add AKIAIOSFODNN7EXAMPLE key", author: "Alice", date: "2026-03-18T10:00:00+00:00" },
        );
      }
      if (c === "gh" && a[0] === "pr") return makeGhPrOutput([]);
      return "";
    });

    await ingestGitMetadata(mdb, filter, baseInput);

    const commitNode = mdb.getNodeBySource("git", "abc1234");
    expect(commitNode).toBeDefined();
    expect(commitNode!.title).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("handles empty git log output (no commits in range)", async () => {
    mockExecFileSync.mockImplementation((cmd: unknown, args: unknown) => {
      const c = cmd as string;
      const a = args as string[];
      if (c === "git" && a[0] === "log") return "";
      if (c === "gh" && a[0] === "pr") return makeGhPrOutput([]);
      return "";
    });

    const result = await ingestGitMetadata(mdb, filter, baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.commits_ingested).toBe(0);
    expect(result.data.prs_ingested).toBe(0);
    expect(result.data.references_created).toBe(0);
  });
});
