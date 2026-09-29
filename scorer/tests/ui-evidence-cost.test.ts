import { describe, expect, it } from "vitest";

import { aggregateUiEvidenceCost } from "../src/ui-evidence-cost.js";
import type { InvocationRecord, UiEvidenceRunRecord } from "../src/ui-evidence-runs.js";

const inv = (over: Partial<InvocationRecord> & Pick<InvocationRecord, "phase">): InvocationRecord => ({ ok: true, elapsedMs: null, inputTokens: null, outputTokens: null, cacheHit: false, ...over });
const run = (over: Partial<UiEvidenceRunRecord>): UiEvidenceRunRecord => ({ ts: "t", brokenSteps: 0, visual: "unchanged", pr: "1", route: "/a", invocations: [], ...over });

describe("aggregateUiEvidenceCost", () => {
  it("reports every phase, with unknown (null) — not zero — when nothing was reported", () => {
    const { phases } = aggregateUiEvidenceCost([run({ invocations: [inv({ phase: "planning", elapsedMs: 1000 })] })]);
    expect(phases.map((p) => p.phase)).toEqual(["planning", "selector-repair", "visual-critique"]);
    expect(phases[0]).toMatchObject({ calls: 1, elapsedMs: { total: 1000, unknown: 0 }, inputTokens: { total: null, unknown: 1 } });
    expect(phases[1]).toMatchObject({ calls: 0, inputTokens: { total: null, unknown: 0 } });
  });

  it("sums only reported values and counts the unreported ones separately", () => {
    const { phases } = aggregateUiEvidenceCost([
      run({ invocations: [inv({ phase: "selector-repair", inputTokens: 100, elapsedMs: 10 }), inv({ phase: "selector-repair", inputTokens: 50 }), inv({ phase: "selector-repair", ok: false })] }),
    ]);
    expect(phases[1]).toMatchObject({ calls: 3, failures: 1, inputTokens: { total: 150, unknown: 1 }, elapsedMs: { total: 10, unknown: 2 } });
  });

  it("counts cache hits separately from model calls", () => {
    const { phases } = aggregateUiEvidenceCost([run({ invocations: [inv({ phase: "visual-critique", cacheHit: true }), inv({ phase: "visual-critique", elapsedMs: 5 })] })]);
    expect(phases[2]).toMatchObject({ calls: 1, cacheHits: 1 });
  });

  it("groups by PR and route, including runs with neither, and sorts deterministically", () => {
    const { byPrRoute } = aggregateUiEvidenceCost([
      run({ pr: "2", route: "/b", visual: "looks-off", brokenSteps: 2, invocations: [inv({ phase: "visual-critique", elapsedMs: 7 }), inv({ phase: "visual-critique", cacheHit: true })] }),
      run({ pr: "1", route: "/a", visual: "unchanged" }),
      run({ pr: "1", route: "/a", visual: "unchecked" }),
      run({ pr: null, route: null, visual: "sloppy" }),
      run({ pr: "1", route: null }),
    ]);
    expect(byPrRoute.map((r) => [r.pr, r.route, r.runs])).toEqual([[null, null, 1], ["1", null, 1], ["1", "/a", 2], ["2", "/b", 1]]);
    const pr2 = byPrRoute.find((r) => r.pr === "2")!;
    expect(pr2).toMatchObject({ brokenSteps: 2, calls: 1, elapsedMs: { total: 7, unknown: 0 } });
    expect(byPrRoute.find((r) => r.pr === "1" && r.route === "/a")!.visual).toMatchObject({ unchanged: 1, unchecked: 1 });
    expect(byPrRoute.find((r) => r.pr === null)!.visual.sloppy).toBe(1);
  });

  it("sorts routes within one PR", () => {
    const { byPrRoute } = aggregateUiEvidenceCost([run({ route: "/z" }), run({ route: "/b" })]);
    expect(byPrRoute.map((r) => r.route)).toEqual(["/b", "/z"]);
  });
});
