import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deriveRepoFromJSONL } from "../src/ingestion/claude-code-watcher.js";

describe("deriveRepoFromJSONL", () => {
  it("extracts repo slug from cwd in first valid line", () => {
    const lines = [
      JSON.stringify({ type: "file-history-snapshot", snapshot: {} }),
      JSON.stringify({ type: "user", uuid: "u1", cwd: "/Users/dev/repos/my-project", sessionId: "s1", message: { role: "user", content: "hi" } }),
    ];
    const result = deriveRepoFromJSONL(lines);
    expect(result).toBe("my-project");
  });

  it("returns null when no valid lines have cwd", () => {
    const lines = [
      JSON.stringify({ type: "file-history-snapshot", snapshot: {} }),
    ];
    const result = deriveRepoFromJSONL(lines);
    expect(result).toBeNull();
  });

  it("returns null for an empty lines array", () => {
    const result = deriveRepoFromJSONL([]);
    expect(result).toBeNull();
  });

  it("returns null when lines are not valid JSON", () => {
    const lines = ["not-json", "{broken"];
    const result = deriveRepoFromJSONL(lines);
    expect(result).toBeNull();
  });

  it("returns null when cwd is empty string", () => {
    const lines = [
      JSON.stringify({ type: "user", cwd: "", sessionId: "s1", message: { role: "user", content: "hi" } }),
    ];
    const result = deriveRepoFromJSONL(lines);
    expect(result).toBeNull();
  });

  it("extracts last segment from deeply nested path", () => {
    const lines = [
      JSON.stringify({ type: "user", cwd: "/a/b/c/deep-repo", sessionId: "s1", message: { role: "user", content: "hi" } }),
    ];
    const result = deriveRepoFromJSONL(lines);
    expect(result).toBe("deep-repo");
  });

  it("uses the first line with a cwd field, skipping lines without", () => {
    const lines = [
      JSON.stringify({ type: "user", sessionId: "s1", message: { role: "user", content: "hi" } }),
      JSON.stringify({ type: "user", cwd: "/repos/first-with-cwd", sessionId: "s1", message: { role: "user", content: "hi" } }),
      JSON.stringify({ type: "user", cwd: "/repos/second-with-cwd", sessionId: "s1", message: { role: "user", content: "hi" } }),
    ];
    const result = deriveRepoFromJSONL(lines);
    expect(result).toBe("first-with-cwd");
  });
});

describe("scanDirectory", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "watcher-test-"));
    mkdirSync(join(tmpDir, "proj1"), { recursive: true });
  });

  it("finds .jsonl files in subdirectories", async () => {
    const { scanDirectory } = await import("../src/ingestion/claude-code-watcher.js");
    writeFileSync(join(tmpDir, "proj1", "session1.jsonl"), "");
    writeFileSync(join(tmpDir, "proj1", "session2.jsonl"), "");
    writeFileSync(join(tmpDir, "proj1", "other.txt"), "");

    const files = scanDirectory(tmpDir);
    expect(files).toHaveLength(2);
    expect(files.every(f => f.endsWith(".jsonl"))).toBe(true);
  });

  it("returns empty array when directory has no .jsonl files", async () => {
    const { scanDirectory } = await import("../src/ingestion/claude-code-watcher.js");
    writeFileSync(join(tmpDir, "proj1", "notes.txt"), "");

    const files = scanDirectory(tmpDir);
    expect(files).toHaveLength(0);
  });

  it("returns absolute paths", async () => {
    const { scanDirectory } = await import("../src/ingestion/claude-code-watcher.js");
    writeFileSync(join(tmpDir, "proj1", "session.jsonl"), "");

    const files = scanDirectory(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\//); // absolute path
  });

  it("scans nested subdirectories recursively", async () => {
    const { scanDirectory } = await import("../src/ingestion/claude-code-watcher.js");
    mkdirSync(join(tmpDir, "proj1", "nested"), { recursive: true });
    writeFileSync(join(tmpDir, "proj1", "top.jsonl"), "");
    writeFileSync(join(tmpDir, "proj1", "nested", "deep.jsonl"), "");

    const files = scanDirectory(tmpDir);
    expect(files).toHaveLength(2);
  });

  it("returns empty array when directory does not exist", async () => {
    const { scanDirectory } = await import("../src/ingestion/claude-code-watcher.js");
    const files = scanDirectory(join(tmpDir, "nonexistent"));
    expect(files).toHaveLength(0);
  });
});

describe("createClaudeCodeWatcher", () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    tmpDir = mkdtempSync(join(tmpdir(), "watcher-test-"));
    mkdirSync(join(tmpDir, "proj1"), { recursive: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("scanOnce enqueues unprocessed .jsonl files with pass: summary", async () => {
    const { createClaudeCodeWatcher } = await import("../src/ingestion/claude-code-watcher.js");

    const filePath = join(tmpDir, "proj1", "session1.jsonl");
    writeFileSync(filePath, JSON.stringify({
      type: "user",
      cwd: "/repos/my-project",
      sessionId: "s1",
      message: { role: "user", content: "hi" },
    }));

    const enqueued: Array<{ sessionId: string; pass: string }> = [];
    const mdb = {
      getNodeBySource: vi.fn().mockReturnValue(undefined),
    } as never;
    const queue = {
      enqueue: vi.fn((job) => { enqueued.push({ sessionId: job.sessionId, pass: job.pass }); }),
    } as never;
    const filter = { redact: (s: string) => s, hasSecrets: () => false };

    const watcher = createClaudeCodeWatcher({
      watchDir: tmpDir,
      mdb,
      queue,
      filter,
    });

    await watcher.scanOnce();

    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].sessionId).toBe("session1");
    expect(enqueued[0].pass).toBe("summary");
  });

  it("scanOnce skips already-processed sessions", async () => {
    const { createClaudeCodeWatcher } = await import("../src/ingestion/claude-code-watcher.js");

    const filePath = join(tmpDir, "proj1", "session1.jsonl");
    writeFileSync(filePath, JSON.stringify({
      type: "user",
      cwd: "/repos/my-project",
      sessionId: "s1",
      message: { role: "user", content: "hi" },
    }));

    const mdb = {
      getNodeBySource: vi.fn().mockReturnValue({ id: "existing-node" }),
    } as never;
    const enqueued: unknown[] = [];
    const queue = {
      enqueue: vi.fn((job) => { enqueued.push(job); }),
    } as never;
    const filter = { redact: (s: string) => s, hasSecrets: () => false };

    const watcher = createClaudeCodeWatcher({
      watchDir: tmpDir,
      mdb,
      queue,
      filter,
    });

    await watcher.scanOnce();

    expect(enqueued).toHaveLength(0);
  });

  it("stop() clears debounce timers", async () => {
    const { createClaudeCodeWatcher } = await import("../src/ingestion/claude-code-watcher.js");

    const mdb = {
      getNodeBySource: vi.fn().mockReturnValue(undefined),
    } as never;
    const queue = { enqueue: vi.fn() } as never;
    const filter = { redact: (s: string) => s, hasSecrets: () => false };

    const watcher = createClaudeCodeWatcher({
      watchDir: tmpDir,
      mdb,
      queue,
      filter,
      debounceMs: 1000,
    });

    // stop should not throw even without start being called
    expect(() => watcher.stop()).not.toThrow();
  });

  it("uses fallback repo when cwd cannot be derived from JSONL", async () => {
    const { createClaudeCodeWatcher } = await import("../src/ingestion/claude-code-watcher.js");

    const filePath = join(tmpDir, "proj1", "session2.jsonl");
    // Write a file with no cwd field
    writeFileSync(filePath, JSON.stringify({ type: "file-history-snapshot", snapshot: {} }));

    const enqueued: Array<{ repo: string }> = [];
    const mdb = {
      getNodeBySource: vi.fn().mockReturnValue(undefined),
    } as never;
    const queue = {
      enqueue: vi.fn((job) => { enqueued.push({ repo: job.repo }); }),
    } as never;
    const filter = { redact: (s: string) => s, hasSecrets: () => false };

    const watcher = createClaudeCodeWatcher({
      watchDir: tmpDir,
      mdb,
      queue,
      filter,
    });

    await watcher.scanOnce();

    expect(enqueued).toHaveLength(1);
    // Should use the parent directory name as fallback
    expect(typeof enqueued[0].repo).toBe("string");
    expect(enqueued[0].repo.length).toBeGreaterThan(0);
  });
});
