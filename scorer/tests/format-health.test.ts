import { describe, expect, it } from "vitest";

import { newHealth, recordHealth, verdict } from "../src/format-health.js";

const outcome = (lineType: string | null, o: { jsonError?: boolean; noUsage?: boolean } = {}) => ({
  lineType, jsonError: o.jsonError ?? false, assistantWithoutUsage: o.noUsage ?? false, records: [],
});

describe("format health", () => {
  it("reports no new data when nothing was read", () => {
    expect(verdict(newHealth())).toEqual({ status: "no-new-data", problems: [], notices: [] });
  });

  it("is ok for normal lines", () => {
    const h = newHealth();
    recordHealth(h, outcome("assistant"));
    recordHealth(h, outcome("user"));
    expect(h).toMatchObject({ lines: 2, assistantLines: 1, assistantWithoutUsage: 0 });
    expect(verdict(h).status).toBe("ok");
  });

  it("recognizes current real line types and does not flag them as unknown", () => {
    const h = newHealth();
    recordHealth(h, outcome("assistant"));
    for (const t of ["cost-state", "file-history-delta", "fork-context-ref", "bridge-session", "agent-name", "frame-link", "artifact-comment-monitor", "artifact-autoreact-ledger", "continued-in", "relocated", "worktree-state"]) {
      recordHealth(h, outcome(t));
    }
    expect(verdict(h)).toEqual({ status: "ok", problems: [], notices: [] });
  });

  it("counts a Codex token_count as a usage line and keeps per-provider line counts", () => {
    const h = newHealth();
    recordHealth(h, outcome("codex:token_count", { noUsage: true }), "main", "codex");
    recordHealth(h, outcome("codex:response_item"), "main", "codex");
    recordHealth(h, outcome("cursor:user"), "main", "cursor");
    expect(h).toMatchObject({ lines: 3, assistantLines: 1, assistantWithoutUsage: 1, usageSourceLines: 2, byProvider: { codex: { files: 0, lines: 2 }, cursor: { files: 0, lines: 1 } } });
    expect(h.byAgentType.main).toEqual({ assistantLines: 1, assistantWithoutUsage: 1 });
    expect(verdict(h).notices).toContain("cursor: 1 lines read — its transcripts carry no token usage, so it counts toward involvement only, not cost");
  });

  it("lists unknown line types as a notice", () => {
    const h = newHealth();
    recordHealth(h, outcome("assistant"));
    recordHealth(h, outcome("user"));
    recordHealth(h, outcome("user"));
    recordHealth(h, outcome("brand-new-type"));
    recordHealth(h, outcome("brand-new-type"));
    expect(verdict(h)).toEqual({ status: "ok", problems: [], notices: ["unrecognized line types: brand-new-type×2"] });
  });

  it("flags unknown format when most assistant lines lack usage", () => {
    const h = newHealth();
    for (let i = 0; i < 10; i++) recordHealth(h, outcome("assistant", { noUsage: i > 0 }));
    const v = verdict(h);
    expect(v.status).toBe("unknown-format");
    expect(v.problems).toContain("9 of 10 assistant lines had no usage record");
  });

  it("flags unknown format when a large read has no assistant lines", () => {
    const h = newHealth();
    for (let i = 0; i < 200; i++) recordHealth(h, outcome("user"));
    expect(verdict(h).problems).toContain("200 lines read but none was an assistant line");
    expect(verdict(h).status).toBe("unknown-format");
  });

  it("flags unknown format when most lines have unknown types", () => {
    const h = newHealth();
    recordHealth(h, outcome("assistant"));
    for (let i = 0; i < 3; i++) recordHealth(h, outcome("mystery"));
    expect(verdict(h).status).toBe("unknown-format");
  });

  it("counts JSON errors and read errors as problems without changing an ok status", () => {
    const h = newHealth();
    recordHealth(h, outcome("assistant"));
    recordHealth(h, outcome(null, { jsonError: true }));
    h.readErrors.push("/x.jsonl: ENOENT");
    expect(verdict(h)).toEqual({ status: "ok", problems: ["1 lines were not valid JSON", "/x.jsonl: ENOENT"], notices: [] });
  });

  it("still lists read errors when there was no new data", () => {
    const h = newHealth();
    h.readErrors.push("/x.jsonl: EACCES");
    expect(verdict(h)).toEqual({ status: "no-new-data", problems: ["/x.jsonl: EACCES"], notices: [] });
  });

  it("flags unknown format when one agent type's assistant lines lack usage, even diluted by other fine agent types", () => {
    const h = newHealth();
    for (let i = 0; i < 30; i++) recordHealth(h, outcome("assistant", { noUsage: true }), "Explore");
    for (let i = 0; i < 10000; i++) recordHealth(h, outcome("assistant"), "main");
    const v = verdict(h);
    expect(v.status).toBe("unknown-format");
    expect(v.problems).toContain("Explore: 30 of 30 assistant lines had no usage record");
  });

  it("treats a small agent type's missing usage as a notice, not a failure", () => {
    const h = newHealth();
    for (let i = 0; i < 5; i++) recordHealth(h, outcome("assistant", { noUsage: i === 0 }), "tiny-agent");
    for (let i = 0; i < 20; i++) recordHealth(h, outcome("assistant"), "main");
    const v = verdict(h);
    expect(v.status).toBe("ok");
    expect(v.notices).toContain("tiny-agent: 1 of 5 assistant lines had no usage record");
  });

  it("still flags the existing global no-usage case", () => {
    const h = newHealth();
    for (let i = 0; i < 10; i++) recordHealth(h, outcome("assistant", { noUsage: i > 0 }), "main");
    const v = verdict(h);
    expect(v.status).toBe("unknown-format");
    expect(v.problems).toContain("9 of 10 assistant lines had no usage record");
  });
});
