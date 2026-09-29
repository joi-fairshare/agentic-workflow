// skills/ui-evidence/src/publish.ts — every write is ask-first; a DB
// provenance of "unknown" hard-gates the Linear upload regardless of the
// answer to ask (RF-2); a failed Linear upload still posts the PR comment
// with local paths and a retry note (RF-4).
export interface RunStep {
  name: string;
  status: "passed" | "failed" | "broken";
  screenshot: string;
}

import type { PlanningMeta } from "./script-schema.js";
import type { ModelInvocation } from "./usage.js";

export interface RunEvidence {
  traces: string[];
  videos: string[];
  /** Pixel-diff overlay against the approved baseline, when one was compared. */
  diff: string | null;
}

export interface RunSummary {
  steps: RunStep[];
  /** "unchanged" = pixel-identical to the approved baseline, no model consulted. */
  visual: "unchecked" | "unchanged" | "looks-right" | "looks-off" | "sloppy";
  visualReasons: string[];
  lintFindings: Array<{ rule: string; selector: string; detail: string }>;
  runId?: string;
  ts?: string;
  pr?: string;
  route?: string;
  /** Fraction of differing pixels vs the approved baseline; null = not compared. */
  diffScore?: number | null;
  /** Every model call made for this run, for the cost baseline. */
  invocations?: ModelInvocation[];
  planning?: PlanningMeta;
  evidence?: RunEvidence;
}

export interface PublishDeps {
  runId: string;
  localDir: string;
  provenance: "seeded" | "unknown";
  linearIssueId: string | null;
  uploadToLinear: (filePath: string, issueId: string) => Promise<{ url: string } | { error: string }>;
  /** Approved uploader (e.g. CI artifact store) returning a reviewer-resolvable URL. */
  uploadArtifact?: (filePath: string) => Promise<{ url: string } | { error: string }>;
  postPrComment: (body: string) => Promise<boolean>;
  ask: (question: string) => Promise<boolean>;
}

export interface PublishResult {
  linearUploaded: boolean;
  prCommentPosted: boolean;
  localPaths: string[];
  /** local path -> URL, only for files the approved uploader accepted. */
  artifactUrls: Record<string, string>;
}

function evidencePaths(summary: RunSummary): string[] {
  const e = summary.evidence;
  return e === undefined ? [] : [...e.traces, ...e.videos, ...(e.diff === null ? [] : [e.diff])];
}

function renderComment(summary: RunSummary, note: string | null, urls: Record<string, string>): string {
  const priority = [...summary.steps.filter((s) => s.status !== "passed"), ...summary.lintFindings];
  const where = (p: string): string => urls[p] ?? p;
  const rows = summary.steps.map((s) => `| ${s.name} | ${s.status} | ${where(s.screenshot)} |`);
  const extra = evidencePaths(summary).map((p) => `- ${where(p)}`);
  const score = summary.diffScore === undefined || summary.diffScore === null ? "" : `\nBaseline diff: ${(summary.diffScore * 100).toFixed(3)}% of pixels`;
  // "unchecked", "looks-off", and "sloppy" all sort first, per spec (the PR
  // comment table leads with unclear/looks-off/sloppy, not looks-right).
  const visualFlag = summary.visual === "looks-right" || summary.visual === "unchanged" ? "" : " ⚠";
  const header = `## UI evidence — visual: ${summary.visual}${visualFlag || (priority.length > 0 ? " ⚠" : "")}`;
  const reasonsLine = summary.visualReasons.length > 0 ? `\nVisual reasons: ${summary.visualReasons.join("; ")}` : "";
  const noteLine = note !== null ? `\n\n${note}` : "";
  const evidenceBlock = extra.length > 0 ? ["", "Evidence:", ...extra].join("\n") : "";
  return [header, "", "| Step | Status | Screenshot |", "|---|---|---|", ...rows, score, reasonsLine, evidenceBlock, noteLine].join("\n");
}

export async function publishEvidence(deps: PublishDeps, summary: RunSummary): Promise<PublishResult> {
  const localPaths = summary.steps.map((s) => s.screenshot);
  const artifactUrls: Record<string, string> = {};

  const okToPublish = await deps.ask(
    `Publish UI evidence for run ${deps.runId}? ${deps.provenance === "seeded" ? "DB provenance: seeded (Linear upload allowed)." : "DB provenance: unknown (Linear upload will be skipped; evidence stays local)."}`,
  );
  if (!okToPublish) return { linearUploaded: false, prCommentPosted: false, localPaths, artifactUrls };

  let linearUploaded = false;
  let uploadNote: string | null = null;
  if (deps.provenance === "seeded" && deps.linearIssueId !== null) {
    const results = await Promise.all(localPaths.map((p) => deps.uploadToLinear(p, deps.linearIssueId as string)));
    const failed = results.find((r) => "error" in r);
    linearUploaded = failed === undefined;
    if (failed !== undefined) uploadNote = `Linear upload failed (${failed.error}) — local paths only; will retry on next push.`;
  } else if (deps.provenance === "unknown") {
    uploadNote = "DB provenance unknown — evidence kept local only, not uploaded to Linear.";
  }

  // Same gate as Linear: only seeded/known-safe data ever leaves the machine.
  if (deps.provenance === "seeded" && deps.uploadArtifact !== undefined) {
    for (const p of [...localPaths, ...evidencePaths(summary)]) {
      const res = await deps.uploadArtifact(p);
      if ("url" in res) artifactUrls[p] = res.url;
    }
  }

  const prCommentPosted = await deps.postPrComment(renderComment(summary, uploadNote, artifactUrls));
  return { linearUploaded, prCommentPosted, localPaths, artifactUrls };
}
