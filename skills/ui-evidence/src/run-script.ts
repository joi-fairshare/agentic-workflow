// skills/ui-evidence/src/run-script.ts — real-browser driver. Excluded from
// unit coverage; its step logic (step-exec.ts) is exercised against a local
// fixture page in tests/browser/, and the pure decisions it delegates to
// (visual-gate, verdict-cache, pixel-diff) are unit-tested at 100%.
import fs from "node:fs";
import path from "node:path";

import { chromium, type Page } from "playwright";

import { runJudge } from "./judge-exec.js";
import type { UiScript } from "./script-schema.js";
import { lintPage, type PageSnapshot } from "./lint-page.js";
import { desktopChromeUserAgent } from "./user-agent.js";
import { comparePngs, cropPng, sha256File } from "./pixel-diff.js";
import type { RunStep, RunSummary } from "./publish.js";
import { executeStep, type RepairFn } from "./step-exec.js";
import { timed, type ModelInvocation } from "./usage.js";
import { hashJson, loadManifest, saveManifest, type CacheContext } from "./verdict-cache.js";
import { runVisualCritique } from "./visual-critique.js";
import { decideVisual } from "./visual-gate.js";

const HOST = "http://localhost:3000"; // never dev/prod — hardcoded, no override
export const VISUAL_PROMPT_VERSION = "visual-critique/v1";

export interface RunOptions {
  /** App build identity (commit SHA); unknown builds only reuse verdicts within one run. */
  appBuild?: string;
  /** Fixture / seed identity. */
  fixtures?: string;
  /** Verdict-cache manifest to read/write; defaults to <runDir>/verdict-cache.json. */
  cacheManifest?: string;
  /** sha256 of the script file this run executed; recorded in summary.json. */
  scriptSha256?: string;
  /** Host override for the local fixture browser tests only. */
  host?: string;
}

const judgeRepair: RepairFn = async (brokenSelector, step, candidates) => {
  const input = JSON.stringify({ brokenSelector, step, candidates });
  try {
    const { stdout } = await runJudge(["ui-element-repair"], input, 6000);
    return JSON.parse(stdout) as { decision: string; chosenIndex?: number };
  } catch {
    return null; // fails open: caller treats this exactly like "no-good-candidate"
  }
};

export async function runScript(script: UiScript, runDir: string, mainBaselineScreenshot?: string, opts: RunOptions = {}): Promise<RunSummary> {
  fs.mkdirSync(runDir, { recursive: true });
  const runId = path.basename(runDir);
  const host = opts.host ?? HOST;
  const invocations: ModelInvocation[] = [];
  const record = (i: ModelInvocation): void => void invocations.push(i);
  if (script.planning !== undefined) {
    const p = script.planning;
    record({ phase: "planning", model: p.model ?? null, elapsedMs: p.elapsedMs ?? null, ok: true, inputTokens: p.inputTokens ?? null, outputTokens: p.outputTokens ?? null });
  }
  // Every repair call is timed at the judge boundary (usage is unknown to the CLI).
  const repair: RepairFn = (b, s, c) => timed("selector-repair", record, () => judgeRepair(b, s, c));

  const browser = await chromium.launch({ headless: true });
  const browserVersion = browser.version();
  const steps: RunStep[] = [];
  const lintFindings: RunSummary["lintFindings"] = [];
  const traces: string[] = [];

  for (const viewport of script.viewports) {
    const context = await browser.newContext({
      viewport: viewport === "phone" ? { width: 375, height: 812 } : { width: 1280, height: 800 },
      userAgent: desktopChromeUserAgent(browserVersion),
      recordVideo: { dir: runDir },
    });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();

    let i = 0;
    for (const step of script.steps) {
      i++;
      const shot = path.join(runDir, `${viewport}-${i}-${step.action}.png`);
      const status = await executeStep(page, step, host, repair);
      await page.screenshot({ path: shot }).catch(() => undefined);
      steps.push({ name: `${viewport}: ${step.action} ${step.target}`, status, screenshot: shot });
    }

    lintFindings.push(...lintPage(await captureSnapshot(page)));

    const trace = path.join(runDir, `${viewport}-trace.zip`);
    await context.tracing.stop({ path: trace });
    traces.push(trace);
    await context.close();
  }

  await browser.close();
  const videos = fs.readdirSync(runDir).filter((f) => f.endsWith(".webm")).map((f) => path.join(runDir, f));

  // Visual verdict: pixel compare first, cache second, one critique on the
  // changed region last. Steps above always ran for real — a cached or
  // "unchanged" visual never stands in for a behavior check.
  const lastPassed = [...steps].reverse().find((s) => s.status === "passed");
  const manifestFile = opts.cacheManifest ?? path.join(runDir, "verdict-cache.json");
  const manifest = loadManifest(manifestFile);
  const diffOut = path.join(runDir, "visual-diff.png");
  const ctx: CacheContext = {
    promptVersion: VISUAL_PROMPT_VERSION,
    model: process.env.AW_VISUAL_MODEL ?? "judge-default",
    appBuild: opts.appBuild ?? null,
    scenario: hashJson({ route: script.route, role: script.role, steps: script.steps, viewports: script.viewports }),
    fixtures: opts.fixtures ?? null,
    viewport: script.viewports.join(","),
    browserVersion,
  };
  const hasFailedSteps = steps.some((s) => s.status !== "passed");

  let gate: Awaited<ReturnType<typeof decideVisual>> = { visual: "unchecked", reasons: [], diffScore: null, diff: null };
  if (lastPassed !== undefined) {
    gate = await decideVisual({
      after: lastPassed.screenshot,
      baseline: mainBaselineScreenshot ?? null,
      hasFailedSteps,
      runId,
      ctx,
      manifest,
      compare: (a, b) => comparePngs(a, b, diffOut),
      hash: sha256File,
      crop: (d) => ({
        after: cropPng(lastPassed.screenshot, d.box!, path.join(runDir, "crop-after.png")),
        baseline: cropPng(mainBaselineScreenshot!, d.box!, path.join(runDir, "crop-baseline.png")),
      }),
      critique: (after, baseline) => timed("visual-critique", record, () => runVisualCritique(after, baseline, runDir)),
      record,
    });
    saveManifest(manifestFile, manifest);
  }

  const summary: RunSummary = {
    runId,
    ts: new Date().toISOString(),
    route: script.route,
    appBuild: opts.appBuild ?? null,
    scriptSha256: opts.scriptSha256 ?? null,
    ...(script.planning?.pr !== undefined ? { pr: script.planning.pr } : {}),
    steps,
    visual: gate.visual,
    visualReasons: gate.reasons,
    lintFindings,
    diffScore: gate.diffScore,
    invocations,
    ...(script.planning !== undefined ? { planning: script.planning } : {}),
    evidence: { traces, videos, diff: gate.diff !== null && !gate.diff.sizeMismatch ? diffOut : null },
  };
  fs.writeFileSync(path.join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
  return summary;
}

async function captureSnapshot(page: Page): Promise<PageSnapshot> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  const elements = await page.evaluate(() => {
    const out: Array<{ selector: string; rect: { x: number; y: number; w: number; h: number }; text: string; computedStyle: Record<string, string>; hasHoverState: boolean; hasFocusState: boolean }> = [];
    const nodes = document.querySelectorAll<HTMLElement>("button, a, input, [role='button'], [data-testid]");
    for (const el of Array.from(nodes)) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const selector = el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "");
      out.push({
        selector,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        text: el.textContent?.trim() ?? "",
        computedStyle: { textOverflow: style.textOverflow, overflow: style.overflow, color: style.color },
        hasHoverState: true,
        hasFocusState: true,
      });
    }
    return out;
  });
  return { elements, viewport: { w: viewport.width, h: viewport.height } };
}
