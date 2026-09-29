import { describe, expect, it, vi } from "vitest";

import { CURSOR_MODEL, makeCursorCliProvider } from "../../src/providers/cursor-cli.js";
import type { QuestionRef } from "../../src/types.js";

const question: QuestionRef<"send" | "batch" | "drop"> = {
  name: "wake-gate", outputs: ["send", "batch", "drop"], prompt: "Classify this message.", contentClass: "message-meta",
};

const imageQuestion: QuestionRef<"looks-right" | "looks-off" | "sloppy"> = {
  name: "visual-critique", outputs: ["looks-right", "looks-off", "sloppy"], prompt: "Look at the screenshot after.png.", contentClass: "image",
  extraProperties: { reasons: { type: "array", items: { type: "string" } } },
};

// The exact envelope shape observed from `cursor-agent -p --output-format json` on 2026.09.02.
function envelope(result: unknown, isError = false): string {
  return JSON.stringify({
    type: "result", subtype: "success", is_error: isError, duration_ms: 3369, duration_api_ms: 3369,
    result, session_id: "s1", request_id: "r1", usage: { inputTokens: 9805, outputTokens: 58 },
  });
}

function setup(stdout: string | Error, overrides: { code?: number | null; timedOut?: boolean; notFound?: boolean } = {}) {
  const spawn = stdout instanceof Error
    ? vi.fn().mockRejectedValue(stdout)
    : vi.fn().mockResolvedValue({ stdout, code: overrides.code === undefined ? 0 : overrides.code, timedOut: overrides.timedOut ?? false, notFound: overrides.notFound });
  const provider = makeCursorCliProvider({ spawn, tmpDirFactory: () => "/tmp/judge-cursor" });
  return { spawn, provider };
}

describe("cursor-cli provider", () => {
  it("is named cursor-cli and covers every content class, including image", () => {
    const { provider } = setup("");
    expect(provider.name).toBe("cursor-cli");
    for (const cls of ["code", "diff", "brief", "transcript", "message-meta", "image"] as const) expect(provider.classes.has(cls)).toBe(true);
  });

  it("invokes exactly the verified `cursor-agent -p` shape from an empty temp workspace, with the recursion guard set", async () => {
    const { spawn, provider } = setup(envelope('{"decision":"send"}'));
    await provider.decide(question, { text: "hi" }, 5000);
    expect(spawn).toHaveBeenCalledTimes(1);
    const [args, opts] = spawn.mock.calls[0] as [string[], { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number }];
    expect(args.slice(0, -1)).toEqual([
      "-p", "--output-format", "json", "--model", CURSOR_MODEL, "--mode", "ask",
      "--sandbox", "enabled", "--trust", "--workspace", "/tmp/judge-cursor",
    ]);
    const prompt = args[args.length - 1];
    expect(prompt).toContain('Classify this message.\n\nInput:\n{"text":"hi"}');
    // No schema flag exists, so the outputs enum is stated in the prompt.
    expect(prompt).toContain('{"type":"object","properties":{"decision":{"type":"string","enum":["send","batch","drop"]}},"required":["decision"]}');
    expect(opts.cwd).toBe("/tmp/judge-cursor");
    expect(opts.env.AW_JUDGE_CHILD).toBe("1");
    expect(opts.timeoutMs).toBe(5000);
  });

  it("uses a model override when given", async () => {
    const spawn = vi.fn().mockResolvedValue({ stdout: envelope('{"decision":"send"}'), code: 0, timedOut: false });
    const provider = makeCursorCliProvider({ spawn, tmpDirFactory: () => "/tmp/x", model: "gpt-5.4-nano-none" });
    await provider.decide(question, {}, 5000);
    const [args] = spawn.mock.calls[0] as [string[]];
    expect(args[args.indexOf("--model") + 1]).toBe("gpt-5.4-nano-none");
  });

  it("parses a bare JSON .result", async () => {
    const { provider } = setup(envelope('{"decision":"batch"}'));
    expect(await provider.decide(question, {}, 5000)).toEqual({ status: "decided", decision: "batch", confidence: 1, reason_code: "cursor-cli" });
  });

  it("parses the last JSON object out of a .result with a prose preamble (observed)", async () => {
    const { provider } = setup(envelope('Checking the workspace first.\n\n{"decision":"drop"}'));
    expect(await provider.decide(question, {}, 5000)).toEqual({ status: "decided", decision: "drop", confidence: 1, reason_code: "cursor-cli" });
  });

  it("threads extra fields through", async () => {
    const { provider } = setup(envelope('{"decision":"batch","chosenIndex":3}'));
    expect(await provider.decide(question, {}, 5000)).toEqual({ status: "decided", decision: "batch", confidence: 1, reason_code: "cursor-cli", extra: { chosenIndex: 3 } });
  });

  it("is an error (cli-reported-error) when the envelope says is_error", async () => {
    const { provider } = setup(envelope("rate limited", true));
    expect(await provider.decide(question, {}, 5000)).toEqual({ status: "error", reason_code: "cli-reported-error" });
  });

  it("is an error (unparseable-output) when stdout is not JSON", async () => {
    const { provider } = setup("Cannot use this model: x");
    expect(await provider.decide(question, {}, 5000)).toEqual({ status: "error", reason_code: "unparseable-output" });
  });

  it("is an error (unparseable-output) when stdout is JSON but not an object", async () => {
    const { provider } = setup("null");
    expect(await provider.decide(question, {}, 5000)).toEqual({ status: "error", reason_code: "unparseable-output" });
  });

  it("is an error (unparseable-result) when .result is missing", async () => {
    const { provider } = setup(JSON.stringify({ type: "result", is_error: false }));
    expect(await provider.decide(question, {}, 5000)).toEqual({ status: "error", reason_code: "unparseable-result" });
  });

  it("is an error (unparseable-result) when .result holds no JSON object", async () => {
    const { provider } = setup(envelope("I would say send."));
    expect(await provider.decide(question, {}, 5000)).toEqual({ status: "error", reason_code: "unparseable-result" });
  });

  it("is an error (unparseable-result) when the JSON object has no decision", async () => {
    const { provider } = setup(envelope('{"answer":"send"}'));
    expect(await provider.decide(question, {}, 5000)).toEqual({ status: "error", reason_code: "unparseable-result" });
  });

  it("is unavailable, not an error, on timeout", async () => {
    const { provider } = setup("", { code: null, timedOut: true });
    expect(await provider.decide(question, {}, 5000)).toEqual({ status: "unavailable", reason_code: "timeout" });
  });

  it("is unavailable when the cursor-agent binary is not installed", async () => {
    const { provider } = setup("", { code: null, notFound: true });
    expect(await provider.decide(question, {}, 5000)).toEqual({ status: "unavailable", reason_code: "binary-not-found" });
  });

  it("is an error on a non-zero exit (e.g. Workspace Trust Required, unknown model)", async () => {
    const { provider } = setup("", { code: 1 });
    expect(await provider.decide(question, {}, 5000)).toEqual({ status: "error", reason_code: "exit-1" });
  });

  it("propagates a spawn rejection as an error, not a throw", async () => {
    const { provider } = setup(new Error("EACCES"));
    expect(await provider.decide(question, {}, 5000)).toEqual({ status: "error", reason_code: "spawn-failed" });
  });
});

describe("cursor-cli provider — image branch", () => {
  it("runs with the evidence dir as workspace and cwd, and asks the agent to read the named files", async () => {
    const { spawn, provider } = setup(envelope('{"decision":"looks-right","reasons":[]}'));
    await provider.decide(imageQuestion, { afterScreenshot: "after.png", baselineScreenshot: null, evidenceDir: "/tmp/run-42" }, 20000);
    const [args, opts] = spawn.mock.calls[0] as [string[], { cwd: string; timeoutMs: number }];
    expect(args[args.indexOf("--workspace") + 1]).toBe("/tmp/run-42");
    expect(args[args.indexOf("--mode") + 1]).toBe("ask");
    const prompt = args[args.length - 1];
    expect(prompt).toContain("Look at the screenshot after.png.");
    expect(prompt).toContain("do not search for them: /tmp/run-42/after.png");
    expect(prompt).toContain('"reasons"');
    expect(prompt).not.toContain("Input:");
    expect(opts.cwd).toBe("/tmp/run-42");
    expect(opts.timeoutMs).toBe(20000);
  });

  it("names the baseline screenshot too, by absolute path, when one is given", async () => {
    const { spawn, provider } = setup(envelope('{"decision":"looks-right","reasons":[]}'));
    await provider.decide(imageQuestion, { afterScreenshot: "after.png", baselineScreenshot: "/abs/main.png", evidenceDir: "/tmp/run-42" }, 20000);
    const [args] = spawn.mock.calls[0] as [string[]];
    expect(args[args.length - 1]).toContain("/tmp/run-42/after.png, /abs/main.png");
  });

  it("threads reasons through as extra on a decided image result, past a prose preamble", async () => {
    const { provider } = setup(envelope('I\'ll open `after.png` now.{"decision":"looks-off","reasons":["misaligned button"]}'));
    const result = await provider.decide(imageQuestion, { afterScreenshot: "a.png", baselineScreenshot: null, evidenceDir: "/tmp/r" }, 20000);
    expect(result).toEqual({ status: "decided", decision: "looks-off", confidence: 1, reason_code: "cursor-cli", extra: { reasons: ["misaligned button"] } });
  });

  it("is unavailable on timeout for the image branch too", async () => {
    const { provider } = setup("", { code: null, timedOut: true });
    expect(await provider.decide(imageQuestion, { afterScreenshot: "a.png", baselineScreenshot: null, evidenceDir: "/tmp/r" }, 20000)).toEqual({ status: "unavailable", reason_code: "timeout" });
  });

  it("is an error on a non-zero exit for the image branch", async () => {
    const { provider } = setup("", { code: 2 });
    expect(await provider.decide(imageQuestion, { afterScreenshot: "a.png", baselineScreenshot: null, evidenceDir: "/tmp/r" }, 20000)).toEqual({ status: "error", reason_code: "exit-2" });
  });
});
