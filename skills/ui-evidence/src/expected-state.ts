import type { ExpectedState } from "./script-schema.js";

// The slice of Playwright's Page an assertion needs, so the assertion logic
// is exercised by both a fake (unit) and a real browser (integration).
export interface AssertablePage {
  url(): string;
  getByText(text: string): { first(): { waitFor(o: { state: "visible" | "hidden"; timeout: number }): Promise<void> } };
  getByTestId(id: string): { waitFor(o: { state: "visible"; timeout: number }): Promise<void>; inputValue(o: { timeout: number }): Promise<string> };
}

const TIMEOUT = 3000;

/** Throws when the expectation does not hold; resolves when it does. */
export async function assertExpectedState(page: AssertablePage, e: ExpectedState): Promise<void> {
  switch (e.kind) {
    case "text-visible":
      await page.getByText(e.text).first().waitFor({ state: "visible", timeout: TIMEOUT });
      return;
    case "text-absent":
      await page.getByText(e.text).first().waitFor({ state: "hidden", timeout: TIMEOUT });
      return;
    case "testid-visible":
      await page.getByTestId(e.testId).waitFor({ state: "visible", timeout: TIMEOUT });
      return;
    case "url-path": {
      const actual = new URL(page.url()).pathname;
      if (actual !== e.path) throw new Error(`expected url path ${e.path}, got ${actual}`);
      return;
    }
    case "input-value": {
      const actual = await page.getByTestId(e.testId).inputValue({ timeout: TIMEOUT });
      if (actual !== e.value) throw new Error(`expected input ${e.testId} = "${e.value}", got "${actual}"`);
      return;
    }
  }
}
