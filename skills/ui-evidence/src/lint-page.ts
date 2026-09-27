// skills/ui-evidence/src/lint-page.ts — deterministic sloppiness lint: no
// model call anywhere in this file, distinct from the Haiku rubric critique
// (visual-critique.ts). PageSnapshot is a plain, injectable data shape (not a
// live Playwright Page) so every rule is unit-testable without a browser.
export interface PageElement {
  selector: string;
  rect: { x: number; y: number; w: number; h: number };
  text: string;
  computedStyle: Record<string, string>;
  hasHoverState: boolean;
  hasFocusState: boolean;
}

export interface PageSnapshot {
  elements: PageElement[];
  viewport: { w: number; h: number };
}

export interface LintFinding {
  rule: "overlap" | "clipped" | "truncated-label" | "phone-overflow" | "non-token-value" | "misaligned-edge" | "missing-hover-focus" | "unresolved-empty-or-loading";
  selector: string;
  detail: string;
}

function overlaps(a: PageElement["rect"], b: PageElement["rect"]): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const INTERACTIVE_SELECTOR = /^(button|a\b|\[role=["']?button["']?\]|input)/i;
const LOADING_OR_EMPTY_PLACEHOLDER = /^\s*(loading\.{0,3}|undefined|null|nan)\s*$|:\s*(undefined|null|nan)\s*$/i;
// A rough "does this text fit in this box" estimate — average glyph width in
// CSS pixels at typical UI font sizes. Not pixel-perfect (no real font
// metrics are available from a plain snapshot), but good enough to catch
// clearly-too-long text the way `clipped` needs to (distinct from
// `truncated-label`, which only fires when the page's own CSS already
// admits it's truncating via `text-overflow: ellipsis`).
const AVG_GLYPH_PX = 7;

export interface LintOptions {
  /** Real token hex values (e.g. read from packages/tokens' compiled DTCG
   * JSON — `$value.hex` under each color node). When omitted, the
   * non-token-value check is skipped entirely rather than guessing at a
   * value list, so an unconfigured caller never gets a false positive. */
  allowedColorValues?: string[];
}

export function lintPage(snapshot: PageSnapshot, options: LintOptions = {}): LintFinding[] {
  const findings: LintFinding[] = [];

  for (let i = 0; i < snapshot.elements.length; i++) {
    for (let j = i + 1; j < snapshot.elements.length; j++) {
      const a = snapshot.elements[i];
      const b = snapshot.elements[j];
      if (overlaps(a.rect, b.rect)) {
        findings.push({ rule: "overlap", selector: `${a.selector} / ${b.selector}`, detail: "bounding boxes overlap" });
      }
      // Left edges close but not equal — a near-miss alignment worth
      // flagging even across two vertically stacked elements (a list of
      // rows sharing a column, say), not just a true bounding-box overlap.
      const edgeDelta = Math.abs(a.rect.x - b.rect.x);
      if (edgeDelta > 0 && edgeDelta <= 4) {
        findings.push({ rule: "misaligned-edge", selector: `${a.selector} / ${b.selector}`, detail: `left edges differ by ${edgeDelta}px` });
      }
    }
  }

  for (const el of snapshot.elements) {
    if (el.rect.x + el.rect.w > snapshot.viewport.w) {
      findings.push({ rule: "phone-overflow", selector: el.selector, detail: `right edge at ${el.rect.x + el.rect.w}px exceeds viewport width ${snapshot.viewport.w}px` });
    }
    if (el.computedStyle.textOverflow === "ellipsis" && el.text.length > 20) {
      findings.push({ rule: "truncated-label", selector: el.selector, detail: `label "${el.text}" is truncated by ellipsis` });
    }
    if (el.computedStyle.overflow === "hidden" && el.computedStyle.textOverflow !== "ellipsis" && el.text.length * AVG_GLYPH_PX > el.rect.w) {
      findings.push({ rule: "clipped", selector: el.selector, detail: `overflow:hidden with text ~${el.text.length * AVG_GLYPH_PX}px wide in a ${el.rect.w}px box` });
    }
    if (INTERACTIVE_SELECTOR.test(el.selector) && (!el.hasHoverState || !el.hasFocusState)) {
      findings.push({ rule: "missing-hover-focus", selector: el.selector, detail: `hasHoverState=${el.hasHoverState} hasFocusState=${el.hasFocusState}` });
    }
    if (LOADING_OR_EMPTY_PLACEHOLDER.test(el.text)) {
      findings.push({ rule: "unresolved-empty-or-loading", selector: el.selector, detail: `rendered text "${el.text}" looks like an unresolved placeholder` });
    }
    if (options.allowedColorValues !== undefined && el.computedStyle.color !== undefined) {
      const value = el.computedStyle.color.toUpperCase();
      if (!options.allowedColorValues.map((v) => v.toUpperCase()).includes(value)) {
        findings.push({ rule: "non-token-value", selector: el.selector, detail: `color ${el.computedStyle.color} is not in packages/tokens' allowed set` });
      }
    }
  }

  return findings;
}
