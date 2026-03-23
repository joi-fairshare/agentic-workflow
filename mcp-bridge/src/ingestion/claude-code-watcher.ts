// mcp-bridge/src/ingestion/claude-code-watcher.ts

import { watch, readdirSync, readFileSync, statSync, type FSWatcher } from "node:fs";
import { join, basename } from "node:path";
import type { MemoryDbClient } from "../db/memory-client.js";
import type { SessionQueue } from "./session-queue.js";
import type { SecretFilter } from "./secret-filter.js";

// ── Public interface ────────────────────────────────────────

export interface ClaudeCodeWatcherConfig {
  watchDir: string;        // e.g. ~/.claude/projects/
  mdb: MemoryDbClient;
  queue: SessionQueue;
  filter: SecretFilter;
  debounceMs?: number;     // default: 30000 (30s)
}

export interface ClaudeCodeWatcher {
  start(): void;
  stop(): void;
  scanOnce(): Promise<void>;  // startup scan
}

// ── Pure helpers ────────────────────────────────────────────

/**
 * Parse JSONL lines and find the first line that has a `cwd` field.
 * Returns the last path segment of that cwd (the repo slug), or null if not found.
 */
export function deriveRepoFromJSONL(lines: string[]): string | null {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!data || typeof data !== "object") continue;

    const obj = data as Record<string, unknown>;
    if (typeof obj.cwd === "string" && obj.cwd.length > 0) {
      // Extract last segment from path
      const parts = obj.cwd.split("/").filter(Boolean);
      if (parts.length > 0) {
        return parts[parts.length - 1];
      }
    }
  }

  return null;
}

/**
 * Recursively scan a directory for all `.jsonl` files.
 * Returns an array of absolute file paths.
 */
export function scanDirectory(dir: string): string[] {
  const results: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        results.push(...scanDirectory(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or is unreadable — return empty
  }

  return results;
}

// ── Factory ─────────────────────────────────────────────────

export function createClaudeCodeWatcher(config: ClaudeCodeWatcherConfig): ClaudeCodeWatcher {
  const { watchDir, mdb, queue, debounceMs = 30_000 } = config;

  let fsWatcher: FSWatcher | null = null;
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Derive the session ID from a .jsonl filename (strip extension).
   */
  function sessionIdFromPath(filePath: string): string {
    const name = basename(filePath);
    return name.endsWith(".jsonl") ? name.slice(0, -6) : name;
  }

  /**
   * Read lines from a file, handling read errors gracefully.
   */
  function readLines(filePath: string): string[] {
    try {
      const content = readFileSync(filePath, "utf8");
      return content.split("\n").filter((l) => l.trim().length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Derive the repo slug from a file, falling back to the parent directory name.
   */
  function deriveRepo(filePath: string, lines: string[]): string {
    const fromJSONL = deriveRepoFromJSONL(lines);
    if (fromJSONL) return fromJSONL;

    // Fallback: use parent directory name
    const parts = filePath.split("/").filter(Boolean);
    // File is at watchDir/<project>/<session>.jsonl — parent dir is the project name
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }
    return "unknown";
  }

  /**
   * Enqueue a file for processing if it hasn't been processed yet.
   */
  function enqueueIfNew(filePath: string, pass: "summary" | "both"): void {
    const sessionId = sessionIdFromPath(filePath);
    const existing = mdb.getNodeBySource("claude-code-session", sessionId);
    if (existing) return;

    const lines = readLines(filePath);
    const repo = deriveRepo(filePath, lines);

    queue.enqueue({ sessionId, filePath, repo, pass });
  }

  return {
    start() {
      if (fsWatcher) return;

      try {
        fsWatcher = watch(watchDir, { recursive: true }, (_event, filename) => {
          if (!filename || !filename.endsWith(".jsonl")) return;

          // Resolve absolute path
          const filePath = join(watchDir, filename);

          // Verify file exists before processing
          try {
            statSync(filePath);
          } catch {
            return;
          }

          // Reset debounce timer for this file
          const existing = debounceTimers.get(filePath);
          if (existing) clearTimeout(existing);

          const timer = setTimeout(() => {
            debounceTimers.delete(filePath);
            enqueueIfNew(filePath, "both");
          }, debounceMs);

          debounceTimers.set(filePath, timer);
        });
      } catch {
        // watchDir doesn't exist or is not watchable — silently skip
      }
    },

    stop() {
      // Clear all debounce timers
      for (const timer of debounceTimers.values()) {
        clearTimeout(timer);
      }
      debounceTimers.clear();

      // Close the fs watcher
      if (fsWatcher) {
        fsWatcher.close();
        fsWatcher = null;
      }
    },

    async scanOnce() {
      const files = scanDirectory(watchDir);

      // Sort by mtime newest-first so recent sessions are processed first
      files.sort((a, b) => {
        try {
          return statSync(b).mtimeMs - statSync(a).mtimeMs;
        } catch {
          return 0;
        }
      });

      let enqueued = 0;
      let skippedExisting = 0;

      for (const filePath of files) {
        const sessionId = sessionIdFromPath(filePath);
        const existing = mdb.getNodeBySource("claude-code-session", sessionId);
        if (existing) {
          skippedExisting++;
          continue;
        }

        const lines = readLines(filePath);
        const repo = deriveRepo(filePath, lines);
        queue.enqueue({ sessionId, filePath, repo, pass: "summary" });
        enqueued++;
      }

      if (files.length > 0) {
        console.log(
          `[claude-code-watcher] Scanned ${files.length} sessions: ${enqueued} queued, ${skippedExisting} already ingested`,
        );
      }
    },
  };
}
