import { describe, expect, it, vi } from "vitest";

import { publishEvidence, type RunSummary } from "../src/publish.js";

const summary: RunSummary = { steps: [{ name: "goto", status: "passed", screenshot: "/tmp/1.png" }], visual: "unchecked", visualReasons: [], lintFindings: [] };

describe("publishEvidence", () => {
  it("uploads to Linear and posts a PR comment when seeded and the user says yes", async () => {
    const uploadToLinear = vi.fn().mockResolvedValue({ url: "https://linear.app/x" });
    const postPrComment = vi.fn().mockResolvedValue(true);
    const ask = vi.fn().mockResolvedValue(true);
    const result = await publishEvidence({ runId: "r1", localDir: "/tmp/r1", provenance: "seeded", linearIssueId: "ISS-1", uploadToLinear, postPrComment, ask }, summary);
    expect(uploadToLinear).toHaveBeenCalled();
    expect(postPrComment).toHaveBeenCalled();
    expect(result).toMatchObject({ linearUploaded: true, prCommentPosted: true });
  });

  it("never uploads to Linear when provenance is unknown, even if asked and the user says yes (RF-2, hard gate)", async () => {
    const uploadToLinear = vi.fn();
    const postPrComment = vi.fn().mockResolvedValue(true);
    const ask = vi.fn().mockResolvedValue(true);
    const result = await publishEvidence({ runId: "r1", localDir: "/tmp/r1", provenance: "unknown", linearIssueId: "ISS-1", uploadToLinear, postPrComment, ask }, summary);
    expect(uploadToLinear).not.toHaveBeenCalled();
    expect(result.linearUploaded).toBe(false);
    expect(result.localPaths).toContain("/tmp/1.png");
  });

  it("skips every live action when the user says no to ask", async () => {
    const uploadToLinear = vi.fn();
    const postPrComment = vi.fn();
    const ask = vi.fn().mockResolvedValue(false);
    const result = await publishEvidence({ runId: "r1", localDir: "/tmp/r1", provenance: "seeded", linearIssueId: "ISS-1", uploadToLinear, postPrComment, ask }, summary);
    expect(uploadToLinear).not.toHaveBeenCalled();
    expect(postPrComment).not.toHaveBeenCalled();
    expect(result).toEqual({ linearUploaded: false, prCommentPosted: false, localPaths: ["/tmp/1.png"] });
  });

  it("still posts the PR comment with local paths when the Linear upload fails (RF-4)", async () => {
    const uploadToLinear = vi.fn().mockResolvedValue({ error: "rate limited" });
    const postPrComment = vi.fn().mockResolvedValue(true);
    const ask = vi.fn().mockResolvedValue(true);
    const result = await publishEvidence({ runId: "r1", localDir: "/tmp/r1", provenance: "seeded", linearIssueId: "ISS-1", uploadToLinear, postPrComment, ask }, summary);
    expect(result.linearUploaded).toBe(false);
    expect(postPrComment).toHaveBeenCalledWith(expect.stringContaining("upload failed"));
    expect(result.prCommentPosted).toBe(true);
  });

  it("skips the Linear upload attempt entirely when linearIssueId is null, still posts the PR comment", async () => {
    const uploadToLinear = vi.fn();
    const postPrComment = vi.fn().mockResolvedValue(true);
    const ask = vi.fn().mockResolvedValue(true);
    const result = await publishEvidence({ runId: "r1", localDir: "/tmp/r1", provenance: "seeded", linearIssueId: null, uploadToLinear, postPrComment, ask }, summary);
    expect(uploadToLinear).not.toHaveBeenCalled();
    expect(result.prCommentPosted).toBe(true);
  });

  it("renders a visual-flag header and reasons line when the visual verdict isn't looks-right", async () => {
    const uploadToLinear = vi.fn().mockResolvedValue({ url: "x" });
    const postPrComment = vi.fn().mockResolvedValue(true);
    const ask = vi.fn().mockResolvedValue(true);
    const off: RunSummary = { steps: [{ name: "goto", status: "passed", screenshot: "/tmp/1.png" }], visual: "looks-off", visualReasons: ["misaligned button"], lintFindings: [] };
    await publishEvidence({ runId: "r1", localDir: "/tmp/r1", provenance: "seeded", linearIssueId: "ISS-1", uploadToLinear, postPrComment, ask }, off);
    const body = postPrComment.mock.calls[0][0] as string;
    expect(body).toContain("looks-off");
    expect(body).toContain("misaligned button");
  });

  it("does not flag the header when everything is looks-right and nothing failed", async () => {
    const uploadToLinear = vi.fn().mockResolvedValue({ url: "x" });
    const postPrComment = vi.fn().mockResolvedValue(true);
    const ask = vi.fn().mockResolvedValue(true);
    const clean: RunSummary = { steps: [{ name: "goto", status: "passed", screenshot: "/tmp/1.png" }], visual: "looks-right", visualReasons: [], lintFindings: [] };
    await publishEvidence({ runId: "r1", localDir: "/tmp/r1", provenance: "seeded", linearIssueId: "ISS-1", uploadToLinear, postPrComment, ask }, clean);
    const body = postPrComment.mock.calls[0][0] as string;
    expect(body).not.toContain("⚠");
  });

  it("flags the header when everything is looks-right but a step failed", async () => {
    const uploadToLinear = vi.fn().mockResolvedValue({ url: "x" });
    const postPrComment = vi.fn().mockResolvedValue(true);
    const ask = vi.fn().mockResolvedValue(true);
    const brokenStep: RunSummary = { steps: [{ name: "click Save", status: "broken", screenshot: "/tmp/1.png" }], visual: "looks-right", visualReasons: [], lintFindings: [] };
    await publishEvidence({ runId: "r1", localDir: "/tmp/r1", provenance: "seeded", linearIssueId: "ISS-1", uploadToLinear, postPrComment, ask }, brokenStep);
    const body = postPrComment.mock.calls[0][0] as string;
    expect(body).toContain("⚠");
  });
});
