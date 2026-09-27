import { describe, expect, it } from "vitest";

import { DEFAULT_CHAIN } from "../src/chain.js";
import { QUESTIONS } from "../src/commands.js";

// Project rule: any question whose content class routes through
// DEFAULT_CHAIN to "claude-cli" must budget at least 10s (the claude-cli
// path measures 3.1-6.1s wall on this machine; 5s times out under real
// load) — 20s for the image class. A new question can never regress this:
// this test walks the REAL QUESTIONS registry, not a fixed list, so adding
// a new claude-cli-routed question without a wide-enough budget fails here
// first, before it ever times out for real in a hook.
describe("timeBudgetMs registry (project rule: >=10s for claude-cli, >=20s for image)", () => {
  it("every registered question routed to claude-cli budgets at least 10s (>=20s for image)", () => {
    const offenders: string[] = [];
    for (const [name, question] of Object.entries(QUESTIONS)) {
      const chainForClass = DEFAULT_CHAIN.classes[question.contentClass] ?? [];
      if (!chainForClass.includes("claude-cli")) continue;
      const minBudget = question.contentClass === "image" ? 20000 : 10000;
      if (question.timeBudgetMs < minBudget) {
        offenders.push(`${name} (contentClass=${question.contentClass}): timeBudgetMs=${question.timeBudgetMs}, needs >=${minBudget}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
