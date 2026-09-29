import { describe, expect, it, vi } from "vitest";

import { publishEvidence, type PublishDeps, type RunSummary } from "../src/publish.js";

const summary: RunSummary = {
  steps: [{ name: "goto", status: "passed", screenshot: "/w/1.png" }],
  visual: "unchanged",
  visualReasons: [],
  lintFindings: [],
  diffScore: 0.00123,
  evidence: { traces: ["/w/desktop-trace.zip"], videos: ["/w/v.webm"], diff: "/w/visual-diff.png" },
};

function deps(over: Partial<PublishDeps>): { d: PublishDeps; post: ReturnType<typeof vi.fn> } {
  const post = vi.fn().mockResolvedValue(true);
  return { post, d: { runId: "r", localDir: "/w", provenance: "seeded", linearIssueId: null, uploadToLinear: vi.fn(), postPrComment: post, ask: async () => true, ...over } };
}

describe("publishEvidence artifacts", () => {
  it("shows uploader URLs (not workspace paths) for screenshots, trace, video and diff", async () => {
    const uploadArtifact = vi.fn(async (p: string) => ({ url: `https://ci.example/a${p}` }));
    const { d, post } = deps({ uploadArtifact });
    const result = await publishEvidence(d, summary);
    const body = post.mock.calls[0]![0] as string;
    expect(uploadArtifact).toHaveBeenCalledTimes(4);
    expect(body).toContain("https://ci.example/a/w/desktop-trace.zip");
    expect(body).toContain("https://ci.example/a/w/visual-diff.png");
    expect(body).toContain("Baseline diff: 0.123% of pixels");
    expect(body).not.toContain("| /w/1.png |");
    expect(result.artifactUrls["/w/1.png"]).toBe("https://ci.example/a/w/1.png");
    expect(body).not.toContain("⚠");
  });

  it("never uploads artifacts when provenance is unknown; evidence stays local", async () => {
    const uploadArtifact = vi.fn();
    const { d, post } = deps({ provenance: "unknown", uploadArtifact });
    const result = await publishEvidence(d, summary);
    expect(uploadArtifact).not.toHaveBeenCalled();
    expect(result.artifactUrls).toEqual({});
    expect(post.mock.calls[0]![0]).toContain("/w/desktop-trace.zip");
  });

  it("never uploads artifacts when the user declines", async () => {
    const uploadArtifact = vi.fn();
    const { d } = deps({ ask: async () => false, uploadArtifact });
    await publishEvidence(d, summary);
    expect(uploadArtifact).not.toHaveBeenCalled();
  });

  it("falls back to the local path for a file the uploader rejected", async () => {
    const { d, post } = deps({ uploadArtifact: async (p) => (p.endsWith(".zip") ? { error: "denied" } : { url: `https://ci/x${p}` }) });
    await publishEvidence(d, summary);
    const body = post.mock.calls[0]![0] as string;
    expect(body).toContain("- /w/desktop-trace.zip");
    expect(body).toContain("https://ci/x/w/v.webm");
  });

  it("renders a summary with no evidence block or diff line when neither exists", async () => {
    const { d, post } = deps({});
    await publishEvidence(d, { steps: [], visual: "sloppy", visualReasons: ["x"], lintFindings: [] });
    const body = post.mock.calls[0]![0] as string;
    expect(body).not.toContain("Evidence:");
    expect(body).not.toContain("Baseline diff");
    expect(body).toContain("⚠");
  });

  it("omits the diff line when the run was not compared (null score)", async () => {
    const { d, post } = deps({});
    await publishEvidence(d, { ...summary, diffScore: null });
    expect(post.mock.calls[0]![0]).not.toContain("Baseline diff");
  });

  it("lists only traces and videos when there is no diff overlay", async () => {
    const { d, post } = deps({});
    await publishEvidence(d, { ...summary, evidence: { traces: ["/w/t.zip"], videos: [], diff: null } });
    const body = post.mock.calls[0]![0] as string;
    expect(body).toContain("- /w/t.zip");
    expect(body).not.toContain("visual-diff.png");
  });
});
