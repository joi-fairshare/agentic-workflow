import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { readOutboxState } from "../src/outbox.js";

function writeFixture(dir: string, name: string, lines: string[]): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), lines.join("\n") + (lines.length > 0 ? "\n" : ""));
}

describe("readOutboxState", () => {
  it("returns zeros for a missing directory (RF-2-style tolerance)", () => {
    expect(readOutboxState(path.join(os.tmpdir(), "does-not-exist-outbox"))).toEqual({ queuedNow: 0, expiredEver: 0 });
  });

  it("counts queued items across per-session jsonl files, excluding expired.jsonl", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outbox-"));
    writeFixture(dir, "s1.jsonl", [
      JSON.stringify({ ts: "2026-09-27T00:00:00Z", agentType: "builder-a", text: "still on task 2" }),
    ]);
    writeFixture(dir, "s2.jsonl", [
      JSON.stringify({ ts: "2026-09-27T00:00:00Z", agentType: null, text: "progress" }),
      JSON.stringify({ ts: "2026-09-27T00:05:00Z", agentType: "builder-b", text: "still on task 5" }),
    ]);
    expect(readOutboxState(dir)).toEqual({ queuedNow: 3, expiredEver: 0 });
  });

  it("counts expired.jsonl separately as expiredEver, never as queuedNow", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outbox-"));
    writeFixture(dir, "s1.jsonl", [JSON.stringify({ ts: "2026-09-27T00:00:00Z", agentType: "builder-a", text: "queued" })]);
    writeFixture(dir, "expired.jsonl", [
      JSON.stringify({ ts: "2026-09-26T00:00:00Z", agentType: "builder-a", text: "old 1" }),
      JSON.stringify({ ts: "2026-09-26T01:00:00Z", agentType: "builder-b", text: "old 2" }),
    ]);
    expect(readOutboxState(dir)).toEqual({ queuedNow: 1, expiredEver: 2 });
  });

  it("tolerates a malformed line without throwing over the whole file (mirrors readProbeDir)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outbox-"));
    writeFixture(dir, "s1.jsonl", ["not json", JSON.stringify({ ts: "2026-09-27T00:00:00Z", agentType: "a", text: "ok" })]);
    expect(readOutboxState(dir)).toEqual({ queuedNow: 1, expiredEver: 0 });
  });

  it("tolerates an empty trailing line", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outbox-"));
    writeFixture(dir, "s1.jsonl", [JSON.stringify({ ts: "2026-09-27T00:00:00Z", agentType: "a", text: "ok" }), ""]);
    expect(readOutboxState(dir)).toEqual({ queuedNow: 1, expiredEver: 0 });
  });

  it("ignores non-jsonl files in the outbox directory", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outbox-"));
    writeFixture(dir, "s1.jsonl", [JSON.stringify({ ts: "2026-09-27T00:00:00Z", agentType: "a", text: "ok" })]);
    fs.writeFileSync(path.join(dir, "s1.jsonl.lock"), "");
    expect(readOutboxState(dir)).toEqual({ queuedNow: 1, expiredEver: 0 });
  });
});
