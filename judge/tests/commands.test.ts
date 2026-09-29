import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../src/config.js";
import {
  runApprove, runAskCheckCli, runBriefGet, runBriefMapByDispatch, runBriefMapByName, runBriefSave, runBriefSetAgentId,
  runConfigGet, runConfigSet, runHealth, runQuestion, runUndo, runWhy,
} from "../src/commands.js";
import { getDecision, openDb, recordDecision, recordFailure } from "../src/db.js";
import { fakeProvider } from "./helpers.js";

describe("runQuestion", () => {
  it("returns the decision as JSON with exit 0", async () => {
    const db = openDb(":memory:");
    const provider = fakeProvider("claude-cli", ["message-meta"], { status: "decided", decision: "send", confidence: 1, reason_code: "claude-cli" });
    const result = await runQuestion("wake-gate", { text: "blocked: need help", senderKind: "teammate" }, { db, config: { questions: {} }, providers: [provider] });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ decision: "send" });
  });

  it("exits 1 with a clear message for an unknown question", async () => {
    const db = openDb(":memory:");
    const result = await runQuestion("nope", {}, { db, config: { questions: {} }, providers: [] });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("unknown question: nope");
  });

  it("prints an escalation as JSON with exit 2, not exit 0 (never guesses)", async () => {
    const db = openDb(":memory:");
    const result = await runQuestion("wake-gate", { text: "some medium length message here", senderKind: "teammate" }, { db, config: { questions: {} }, providers: [] });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toEqual({ escalate: true, reason_code: "no-provider-decided" });
  });
});

describe("runUndo", () => {
  it("marks a decision undone and prints it", () => {
    const db = openDb(":memory:");
    recordDecision(db, { id: "d1", ts: "2026-09-27T00:00:00.000Z", question: "wake-gate", content_class: "message-meta", provider: "rules", decision: "drop", confidence: 1, reason_code: "pre-rule", latency_ms: 0, input_digest: "x", undone_at: null, chain_position: 0, skipped: [], outcome: "decided" });
    const result = runUndo(db, "d1", () => new Date("2026-09-27T01:00:00.000Z"));
    expect(result.exitCode).toBe(0);
    expect(getDecision(db, "d1")?.undone_at).toBe("2026-09-27T01:00:00.000Z");
  });

  it("exits 1 for an unknown id", () => {
    const db = openDb(":memory:");
    expect(runUndo(db, "nope", () => new Date()).exitCode).toBe(1);
  });
});

describe("runWhy", () => {
  it("prints the full decision row", () => {
    const db = openDb(":memory:");
    recordDecision(db, { id: "d1", ts: "2026-09-27T00:00:00.000Z", question: "wake-gate", content_class: "message-meta", provider: "rules", decision: "drop", confidence: 1, reason_code: "pre-rule", latency_ms: 0, input_digest: "x", undone_at: null, chain_position: 0, skipped: [], outcome: "decided" });
    const result = runWhy(db, "d1");
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ id: "d1", reason_code: "pre-rule" });
  });

  it("exits 1 for an unknown id", () => {
    expect(runWhy(openDb(":memory:"), "nope").exitCode).toBe(1);
  });
});

describe("runApprove", () => {
  it("prefixes the reason_code with approved: and exits 0", () => {
    const db = openDb(":memory:");
    recordDecision(db, { id: "d1", ts: "2026-09-27T00:00:00.000Z", question: "wake-gate", content_class: "message-meta", provider: "rules", decision: "drop", confidence: 1, reason_code: "pre-rule", latency_ms: 0, input_digest: "x", undone_at: null, chain_position: 0, skipped: [], outcome: "decided" });
    const result = runApprove(db, "d1");
    expect(result.exitCode).toBe(0);
    expect(getDecision(db, "d1")?.reason_code).toBe("approved:pre-rule");
  });

  it("exits 1 for an unknown id", () => {
    expect(runApprove(openDb(":memory:"), "nope").exitCode).toBe(1);
  });
});

function decidedRow(id: string, overrides: Partial<Parameters<typeof recordDecision>[1]> = {}): Parameters<typeof recordDecision>[1] {
  return {
    id, ts: new Date().toISOString(), question: "wake-gate", content_class: "message-meta",
    provider: "claude-cli", decision: "send", confidence: 1, reason_code: "claude-cli", latency_ms: 1,
    input_digest: "x", undone_at: null, chain_position: 0, skipped: [], outcome: "decided",
    ...overrides,
  };
}

describe("runHealth", () => {
  it("reports ok with zero recent failures", () => {
    const db = openDb(":memory:");
    const result = runHealth(db);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "ok", failures24h: 0 });
  });

  it("reports degraded once there are any failures in the last 24h", () => {
    const db = openDb(":memory:");
    for (let i = 0; i < 5; i++) recordFailure(db, { ts: new Date().toISOString(), question: "wake-gate", provider: "claude-cli", reason_code: "timeout" });
    const result = runHealth(db);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "degraded", failures24h: 5 });
  });

  it("reports degraded, not ok, for even a single failure (the user's real bug: a real timeout silently counted as 0)", () => {
    const db = openDb(":memory:");
    recordFailure(db, { ts: new Date().toISOString(), question: "wake-gate", provider: "claude-cli", reason_code: "timeout" });
    const result = runHealth(db);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "degraded", failures24h: 1 });
  });

  it("reports down when the last 5 model attempts all failed", () => {
    const db = openDb(":memory:");
    recordFailure(db, { ts: new Date().toISOString(), question: "wake-gate", provider: "claude-cli", reason_code: "timeout" });
    for (let i = 0; i < 5; i++) recordDecision(db, decidedRow(`f${i}`, { outcome: "failed", decision: null, provider: "none" }));
    const result = runHealth(db);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "down" });
  });

  it("reports degraded, not down, when only some of the last 5 model attempts failed", () => {
    const db = openDb(":memory:");
    recordFailure(db, { ts: new Date().toISOString(), question: "wake-gate", provider: "claude-cli", reason_code: "timeout" });
    for (let i = 0; i < 4; i++) recordDecision(db, decidedRow(`f${i}`, { outcome: "failed", decision: null, provider: "none" }));
    recordDecision(db, decidedRow("ok0"));
    const result = runHealth(db);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "degraded" });
  });

  it("does not report down from fewer than 5 attempts, even if all failed", () => {
    const db = openDb(":memory:");
    recordFailure(db, { ts: new Date().toISOString(), question: "wake-gate", provider: "claude-cli", reason_code: "timeout" });
    for (let i = 0; i < 2; i++) recordDecision(db, decidedRow(`f${i}`, { outcome: "failed", decision: null, provider: "none" }));
    const result = runHealth(db);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "degraded" });
  });

  it("ignores escalated (not failed) rows when checking the last-5-attempts down condition", () => {
    const db = openDb(":memory:");
    recordFailure(db, { ts: new Date().toISOString(), question: "wake-gate", provider: "claude-cli", reason_code: "timeout" });
    for (let i = 0; i < 5; i++) recordDecision(db, decidedRow(`e${i}`, { outcome: "escalated", decision: null, provider: "none" }));
    const result = runHealth(db);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "degraded" });
  });
});

describe("runConfigGet / runConfigSet", () => {
  it("get prints the config that would be loaded, from a real path", () => {
    const result = runConfigGet();
    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it("get reads from an explicit file path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "judge-cfg-get-"));
    const file = path.join(dir, "config.json");
    fs.writeFileSync(file, JSON.stringify({ questions: { "wake-gate": { enabled: false, threshold: 0.5 } } }));
    const result = runConfigGet(file);
    expect(JSON.parse(result.stdout)).toEqual({ questions: { "wake-gate": { enabled: false, threshold: 0.5 } } });
  });

  it("set writes enabled=false and reads it back", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "judge-cfg-set-"));
    const file = path.join(dir, "config.json");
    const setResult = runConfigSet("wake-gate", "enabled", "false", file);
    expect(setResult.exitCode).toBe(0);
    const written = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(written.questions["wake-gate"].enabled).toBe(false);
  });

  it("set updates only the given field, keeping the other value from an existing file entry", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "judge-cfg-set-"));
    const file = path.join(dir, "config.json");
    fs.writeFileSync(file, JSON.stringify({ questions: { "wake-gate": { enabled: true, threshold: 0.42 } } }));
    const setResult = runConfigSet("wake-gate", "enabled", "false", file);
    expect(setResult.exitCode).toBe(0);
    const written = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(written.questions["wake-gate"]).toEqual({ enabled: false, threshold: 0.42 });
  });

  it("set defaults a brand-new question's other field when the file exists but doesn't mention it yet", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "judge-cfg-set-"));
    const file = path.join(dir, "config.json");
    fs.writeFileSync(file, JSON.stringify({ questions: { "wake-gate": { enabled: true, threshold: 0.7 } } }));
    const setResult = runConfigSet("some-other-question", "enabled", "false", file);
    expect(setResult.exitCode).toBe(0);
    const written = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(written.questions["some-other-question"]).toEqual({ enabled: false, threshold: 0.7 });
  });

  it("set preserves a hand-edited providers block", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "judge-cfg-set-"));
    const file = path.join(dir, "config.json");
    fs.writeFileSync(file, JSON.stringify({ questions: {}, providers: { agentClis: ["codex-cli"], jev: false } }));
    runConfigSet("wake-gate", "threshold", "0.8", file);
    const written = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(written.providers).toEqual({ agentClis: ["codex-cli"], jev: false });
    expect(written.questions["wake-gate"].threshold).toBe(0.8);
  });

  it("set writes a numeric threshold and reads it back", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "judge-cfg-set-"));
    const file = path.join(dir, "config.json");
    const setResult = runConfigSet("wake-gate", "threshold", "0.85", file);
    expect(setResult.exitCode).toBe(0);
    const written = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(written.questions["wake-gate"].threshold).toBe(0.85);
  });

  it("set rejects a non-numeric threshold", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "judge-cfg-set-"));
    const file = path.join(dir, "config.json");
    const result = runConfigSet("wake-gate", "threshold", "not-a-number", file);
    expect(result.exitCode).toBe(1);
  });
});

describe("runUiElementRepairCli (fix: chosenIndex must leave the judge CLI)", () => {
  it("prints {decision, chosenIndex} when a candidate is repaired, not the generic decision envelope", async () => {
    const { runUiElementRepairCli } = await import("../src/commands.js");
    const db = openDb(":memory:");
    const provider = fakeProvider("claude-cli", ["code"], {
      status: "decided", decision: "repaired", confidence: 1, reason_code: "model", extra: { chosenIndex: 2 },
    });
    const result = await runUiElementRepairCli(
      { brokenSelector: "#gone", step: "click Save", candidates: [{ index: 2, role: "button", accessibleName: "Save", testId: null, text: "Save" }] },
      { db, config: { questions: {} }, providers: [provider] },
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ decision: "repaired", chosenIndex: 2 });
  });

  it("prints only {decision} with no candidates (pre-rule, no model call)", async () => {
    const { runUiElementRepairCli } = await import("../src/commands.js");
    const db = openDb(":memory:");
    const result = await runUiElementRepairCli(
      { brokenSelector: "#gone", step: "click Save", candidates: [] },
      { db, config: { questions: {} }, providers: [] },
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ decision: "no-good-candidate" });
  });
});

describe("runUiElementRepairCli — escalation path", () => {
  it("prints only {decision: no-good-candidate} when every provider fails to decide", async () => {
    const { runUiElementRepairCli } = await import("../src/commands.js");
    const db = openDb(":memory:");
    const result = await runUiElementRepairCli(
      { brokenSelector: "#gone", step: "click Save", candidates: [{ index: 0, role: "button", accessibleName: "Save", testId: null, text: "Save" }] },
      { db, config: { questions: {} }, providers: [] },
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ decision: "no-good-candidate" });
  });
});

describe("runVisualCritiqueCli", () => {
  it("prints {decision, reasons} when reasons ride through as extra", async () => {
    const { runVisualCritiqueCli } = await import("../src/commands.js");
    const db = openDb(":memory:");
    const provider = fakeProvider("claude-cli", ["image"], {
      status: "decided", decision: "looks-off", confidence: 1, reason_code: "model", extra: { reasons: ["misaligned button"] },
    });
    const result = await runVisualCritiqueCli({ afterScreenshot: "a.png", baselineScreenshot: null, evidenceDir: "/tmp/r" }, { db, config: { questions: {} }, providers: [provider] });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ decision: "looks-off", reasons: ["misaligned button"] });
  });

  it("defaults reasons to [] when a decided result carries none", async () => {
    const { runVisualCritiqueCli } = await import("../src/commands.js");
    const db = openDb(":memory:");
    const provider = fakeProvider("claude-cli", ["image"], { status: "decided", decision: "looks-right", confidence: 1, reason_code: "model" });
    const result = await runVisualCritiqueCli({ afterScreenshot: "a.png", baselineScreenshot: null, evidenceDir: "/tmp/r" }, { db, config: { questions: {} }, providers: [provider] });
    expect(JSON.parse(result.stdout)).toEqual({ decision: "looks-right", reasons: [] });
  });

  it("escalates with exit 2 when the call fails or times out (RF-5, never a guessed looks-right)", async () => {
    const { runVisualCritiqueCli } = await import("../src/commands.js");
    const db = openDb(":memory:");
    const result = await runVisualCritiqueCli({ afterScreenshot: "a.png", baselineScreenshot: null, evidenceDir: "/tmp/r" }, { db, config: { questions: {} }, providers: [] });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ escalate: true });
  });
});

describe("runBriefSave / runBriefGet", () => {
  it("saves a brief and retrieves it by tool_use_id", () => {
    const db = openDb(":memory:");
    const saved = runBriefSave(db, { toolUseId: "tu1", sessionId: "s1", promptId: "p1", dispatchName: null, subagentType: "lean-coder", goal: "x", acceptanceCriteria: "y", proofCommand: "npm test" }, () => new Date("2026-09-27T00:00:00.000Z"));
    expect(saved.exitCode).toBe(0);
    const got = runBriefGet(db, "tu1");
    expect(got.exitCode).toBe(0);
    expect(JSON.parse(got.stdout)).toMatchObject({ goal: "x", agentId: null });
  });

  it("rejects an invalid payload with exit 1", () => {
    const db = openDb(":memory:");
    expect(runBriefSave(db, { toolUseId: "tu1" }).exitCode).toBe(1);
  });

  it("get exits 1 for an unknown tool_use_id", () => {
    expect(runBriefGet(openDb(":memory:"), "nope").exitCode).toBe(1);
  });
});

describe("runBriefMapByName / runBriefMapByDispatch / runBriefSetAgentId", () => {
  it("map-by-name prints the bare oldest unmapped toolUseId, or nothing", () => {
    const db = openDb(":memory:");
    runBriefSave(db, { toolUseId: "tu1", sessionId: "s1", promptId: "p1", dispatchName: "builder-a", subagentType: "general-purpose", goal: "x", acceptanceCriteria: "y", proofCommand: "z" });
    expect(runBriefMapByName(db, "builder-a")).toEqual({ exitCode: 0, stdout: "tu1" });
    expect(runBriefMapByName(db, "nobody")).toEqual({ exitCode: 0, stdout: "" });
  });

  it("map-by-dispatch prints the bare matching toolUseId, or nothing", () => {
    const db = openDb(":memory:");
    runBriefSave(db, { toolUseId: "tu2", sessionId: "s1", promptId: "p1", dispatchName: null, subagentType: "lean-coder", goal: "x", acceptanceCriteria: "y", proofCommand: "z" });
    expect(runBriefMapByDispatch(db, "s1", "p1", "lean-coder")).toEqual({ exitCode: 0, stdout: "tu2" });
    expect(runBriefMapByDispatch(db, "s1", "p1", "lean-reviewer")).toEqual({ exitCode: 0, stdout: "" });
  });

  it("set-agent-id maps and makes the brief retrievable by tool_use_id with agentId set", () => {
    const db = openDb(":memory:");
    runBriefSave(db, { toolUseId: "tu3", sessionId: "s1", promptId: "p1", dispatchName: null, subagentType: "lean-coder", goal: "x", acceptanceCriteria: "y", proofCommand: "z" });
    expect(runBriefSetAgentId(db, "tu3", "agent-1")).toEqual({ exitCode: 0, stdout: "" });
    expect(JSON.parse(runBriefGet(db, "tu3").stdout)).toMatchObject({ agentId: "agent-1" });
  });
});

describe("runAskCheckCli", () => {
  it("exits 2 for a 'continue' decision (Stop hook's inverted contract)", async () => {
    const db = openDb(":memory:");
    const cli = fakeProvider("claude-cli", ["transcript"], { status: "decided", decision: "continue", confidence: 0.9, reason_code: "model" });
    const result = await runAskCheckCli({ transcriptTail: "running the next test per the plan" }, { db, config: DEFAULT_CONFIG, providers: [cli] });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ decision: "continue" });
  });

  it("exits 0 for an 'ask' decision (deny-list pre-rule)", async () => {
    const db = openDb(":memory:");
    const cli = fakeProvider("claude-cli", ["transcript"], { status: "decided", decision: "continue", confidence: 0.9, reason_code: "model" });
    const result = await runAskCheckCli({ transcriptTail: "about to push the branch" }, { db, config: DEFAULT_CONFIG, providers: [cli] });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ decision: "ask" });
  });

  it("exits 0 and reports 'ask' when no provider decides at all (fail safe to asking, never to auto-continuing)", async () => {
    const db = openDb(":memory:");
    const result = await runAskCheckCli({ transcriptTail: "anything" }, { db, config: DEFAULT_CONFIG, providers: [] });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ decision: "ask" });
  });
});
