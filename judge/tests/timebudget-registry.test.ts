import { describe, expect, it } from "vitest";

import { buildChain } from "../src/chain.js";
import { QUESTIONS } from "../src/commands.js";
import { DEFAULT_AGENT_CLI_ORDER } from "../src/detect.js";

// Project rule: any question whose content class routes through the chain
// to an agent CLI (claude-cli, codex-cli, cursor-cli) must budget at least 10s (the claude-cli
// path measures 3.1-6.1s wall on this machine; 5s times out under real
// load) — 20s for the image class. A new question can never regress this:
// this test walks the REAL QUESTIONS registry, not a fixed list, so adding
// a new agent-CLI-routed question without a wide-enough budget fails here
// first, before it ever times out for real in a hook.
// cursor-cli measured 8-11s wall on 2026-09-28 (fixed CLI startup), so a
// cursor-only box will often time out at the 10s text floor — it then falls
// through to rules and escalates, which is safe, just not useful.
describe("timeBudgetMs registry (project rule: >=10s for agent CLIs, >=20s for image)", () => {
  it("every registered question routed to an agent CLI budgets at least 10s (>=20s for image)", () => {
    const chain = buildChain({ agentClis: DEFAULT_AGENT_CLI_ORDER, jev: true });
    const offenders: string[] = [];
    for (const [name, question] of Object.entries(QUESTIONS)) {
      const chainForClass = chain.classes[question.contentClass] ?? [];
      if (!chainForClass.some((p) => (DEFAULT_AGENT_CLI_ORDER as readonly string[]).includes(p))) continue;
      const minBudget = question.contentClass === "image" ? 20000 : 10000;
      if (question.timeBudgetMs < minBudget) {
        offenders.push(`${name} (contentClass=${question.contentClass}): timeBudgetMs=${question.timeBudgetMs}, needs >=${minBudget}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
