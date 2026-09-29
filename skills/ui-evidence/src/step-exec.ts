// skills/ui-evidence/src/step-exec.ts — per-step execution against a real
// Playwright Page. Covered by the local-fixture browser tests
// (tests/browser/), not by unit coverage.
import type { Page } from "playwright";

import { assertExpectedState } from "./expected-state.js";
import { candidateFits, resolveCandidate, type Candidate, type RepairProposal } from "./repair.js";
import { describeExpectedState, type ScriptStep } from "./script-schema.js";

const INTERACTIVE = "button, a, input, [role], [data-testid]";
const MAX_REPAIR_ATTEMPTS = 2;

export type StepOutcome = "passed" | "failed" | "broken";

export type RepairFn = (brokenSelector: string, step: string, candidates: Candidate[]) => Promise<RepairProposal | null>;

export async function performAction(page: Page, step: ScriptStep, host: string, timeout = 5000): Promise<void> {
  if (step.action === "goto") {
    await page.goto(`${host}${step.target}`);
  } else if (step.action === "click") {
    await page.getByTestId(step.target).click({ timeout });
  } else if (step.action === "fill") {
    await page.getByTestId(step.target).fill(step.value ?? "", { timeout });
  } else {
    await page.getByText(step.target).locator("visible=true").first().waitFor({ state: "visible", timeout });
  }
}

/** Currently-visible interactive elements; `index` is the DOM-order position. */
export async function enumerateVisibleCandidates(page: Page): Promise<Candidate[]> {
  return page.evaluate((selector) => {
    const out: Array<{ index: number; role: string | null; accessibleName: string | null; testId: string | null; text: string | null }> = [];
    Array.from(document.querySelectorAll<HTMLElement>(selector)).forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden" || style.display === "none") return;
      out.push({
        index,
        role: el.getAttribute("role") ?? el.tagName.toLowerCase(),
        accessibleName: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? null,
        testId: el.getAttribute("data-testid"),
        text: el.textContent?.trim() ?? null,
      });
    });
    return out;
  }, INTERACTIVE);
}

/**
 * Runs one step and checks its expected state.
 *  - action throws  -> selector is broken: ask the judge for a candidate,
 *    run the *same action* on it, then re-check the expected state.
 *  - action ok but expectation fails -> "failed" (a real behavior failure;
 *    never repaired, never masked by a model).
 */
export async function executeStep(page: Page, step: ScriptStep, host: string, repair: RepairFn, timeout = 5000): Promise<StepOutcome> {
  try {
    await performAction(page, step, host, timeout);
  } catch {
    if (step.action !== "click" && step.action !== "fill") return "broken";
    return (await repairAndRun(page, step, step.action, repair, timeout)) ? "passed" : "broken";
  }
  try {
    await assertExpectedState(page, step.expectedState);
    return "passed";
  } catch {
    return "failed";
  }
}

async function repairAndRun(page: Page, step: ScriptStep, action: "click" | "fill", repair: RepairFn, timeout: number): Promise<boolean> {
  const description = `${action} ${step.target}; expected: ${describeExpectedState(step.expectedState)}`;
  for (let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS; attempt++) {
    const visible = await enumerateVisibleCandidates(page);
    const chosen = resolveCandidate(await repair(step.target, description, visible), visible);
    if (chosen === null || !candidateFits(action, chosen)) continue;
    try {
      const el = page.locator(INTERACTIVE).nth(chosen.index);
      // The DOM must not have shifted between enumeration and the action.
      if ((await el.getAttribute("data-testid")) !== chosen.testId) continue;
      if (action === "click") await el.click({ timeout });
      else await el.fill(step.value ?? "", { timeout });
      await assertExpectedState(page, step.expectedState);
      return true;
    } catch {
      // action or expectation failed on the proposed candidate: next attempt
    }
  }
  return false;
}
