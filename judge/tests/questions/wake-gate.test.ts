import { describe, expect, it } from "vitest";

import { wakeGate } from "../../src/questions/wake-gate.js";

describe("wakeGate", () => {
  it("declares message-meta as its content class", () => {
    expect(wakeGate.contentClass).toBe("message-meta");
  });

  it("declares exactly send/batch/drop as outputs", () => {
    expect(wakeGate.outputs).toEqual(["send", "batch", "drop"]);
  });

  it("has a 10s time budget (a real login's claude-cli call with --json-schema measured 5.3-6.1s wall; 5s timed out 2 of 3 real calls)", () => {
    expect(wakeGate.timeBudgetMs).toBe(10000);
  });

  describe("pre-rules (fast paths, spec F7)", () => {
    it("drops a pure JSON ack", () => {
      expect(wakeGate.preRules?.({ text: '{"type":"ack"}', senderKind: "teammate" })).toBe("drop");
    });

    it("drops a very short message", () => {
      expect(wakeGate.preRules?.({ text: "ok", senderKind: "teammate" })).toBe("drop");
    });

    it("does not drop a short but substantive message", () => {
      expect(wakeGate.preRules?.({ text: "PR #4821 is up", senderKind: "teammate" })).toBeNull();
    });

    it("sends a plan-change or blocker keyword regardless of length", () => {
      expect(wakeGate.preRules?.({ text: "blocked: needs your review", senderKind: "teammate" })).toBe("send");
    });

    it("falls through to the model chain for anything else", () => {
      expect(wakeGate.preRules?.({ text: "Finished refactoring the parser module and updated the tests.", senderKind: "teammate" })).toBeNull();
    });
  });

  it("builds a prompt that includes the message text", () => {
    expect(wakeGate.prompt({ text: "status update", senderKind: "teammate" })).toContain("status update");
  });

  it("validates input via its Zod schema", () => {
    expect(wakeGate.inputSchema.safeParse({ text: "hi", senderKind: "teammate" }).success).toBe(true);
    expect(wakeGate.inputSchema.safeParse({ text: "hi", senderKind: "postman" }).success).toBe(false);
    expect(wakeGate.inputSchema.safeParse({ senderKind: "teammate" }).success).toBe(false);
  });

  it("accepts main as a real senderKind (fix for send-gate.sh's actual output, review 2026-09-27)", () => {
    expect(wakeGate.inputSchema.safeParse({ text: "hi", senderKind: "main" }).success).toBe(true);
  });
});
