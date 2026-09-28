import { describe, expect, it, vi } from "vitest";

import { makeJevProvider } from "../../src/providers/jev.js";
import type { QuestionRef } from "../../src/types.js";

const question: QuestionRef<"send" | "batch" | "drop"> = {
  name: "wake-gate", outputs: ["send", "batch", "drop"], prompt: "Classify this message.", contentClass: "message-meta",
};

describe("jev provider", () => {
  it("covers every text class, not image (F2: vendor review cleared company-code classes 2026-09-28; Jev is text-only)", () => {
    const provider = makeJevProvider({ fetch: vi.fn(), apiKey: async () => "k" });
    expect(provider.classes).toEqual(new Set(["message-meta", "code", "diff", "brief", "transcript"]));
  });

  it("is unavailable, not an error, with no API key (RF-2)", async () => {
    const fetch = vi.fn();
    const provider = makeJevProvider({ fetch, apiKey: async () => null });
    expect(await provider.decide(question, { text: "hi" }, 1000)).toEqual({ status: "unavailable", reason_code: "no-api-key" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts to /v1/systemone with the jev-1.13.0 model, a bearer token, and a choice question", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ answers: { decision: { type: "choice", choice: "send", confidence: 0.95 } } }) });
    const provider = makeJevProvider({ fetch, apiKey: async () => "k-123" });
    await provider.decide(question, { text: "hi" }, 1000);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer k-123");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.model).toBe("jev-1.13.0");
    expect(body.state).toEqual({ text: "hi" });
    const questions = body.questions as Record<string, { type: string; instructions: string; criteria: Record<string, string> }>;
    expect(questions.decision.type).toBe("choice");
    expect(questions.decision.instructions).toBe(question.prompt);
    expect(questions.decision.criteria).toEqual({ send: "send", batch: "batch", drop: "drop" });
  });

  it("rejects a Choice question with more than 255 options before calling fetch", async () => {
    const fetch = vi.fn();
    const provider = makeJevProvider({ fetch, apiKey: async () => "k" });
    const tooMany: QuestionRef<string> = { ...question, outputs: Array.from({ length: 256 }, (_, i) => `o${i}`) };
    expect(await provider.decide(tooMany, {}, 1000)).toEqual({ status: "error", reason_code: "too-many-options" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("parses a decided answer within the enum", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ answers: { decision: { type: "choice", choice: "batch", confidence: 0.8 } } }) });
    const provider = makeJevProvider({ fetch, apiKey: async () => "k" });
    expect(await provider.decide(question, {}, 1000)).toEqual({ status: "decided", decision: "batch", confidence: 0.8, reason_code: "jev" });
  });

  it("is an error on a response status below 200", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 100, json: async () => ({}) });
    const provider = makeJevProvider({ fetch, apiKey: async () => "k" });
    expect(await provider.decide(question, {}, 1000)).toEqual({ status: "error", reason_code: "http-100" });
  });

  it("is an error on a non-2xx response", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 429, json: async () => ({}) });
    const provider = makeJevProvider({ fetch, apiKey: async () => "k" });
    expect(await provider.decide(question, {}, 1000)).toEqual({ status: "error", reason_code: "http-429" });
  });

  it("is an error when the response has no usable answer field", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 200, json: async () => ({}) });
    const provider = makeJevProvider({ fetch, apiKey: async () => "k" });
    expect(await provider.decide(question, {}, 1000)).toEqual({ status: "error", reason_code: "unparseable-result" });
  });

  it("is an error when the answered choice isn't one of the question's outputs", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ answers: { decision: { type: "choice", choice: "not-an-option" } } }) });
    const provider = makeJevProvider({ fetch, apiKey: async () => "k" });
    expect(await provider.decide(question, {}, 1000)).toEqual({ status: "error", reason_code: "unparseable-result" });
  });

  it("defaults confidence to 1 when the response omits it", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ answers: { decision: { type: "choice", choice: "send" } } }) });
    const provider = makeJevProvider({ fetch, apiKey: async () => "k" });
    expect(await provider.decide(question, {}, 1000)).toEqual({ status: "decided", decision: "send", confidence: 1, reason_code: "jev" });
  });

  it("is a network error, not a timeout, for a DOMException whose name isn't AbortError", async () => {
    const fetch = vi.fn().mockRejectedValue(new DOMException("blocked", "SecurityError"));
    const provider = makeJevProvider({ fetch, apiKey: async () => "k" });
    expect(await provider.decide(question, {}, 1000)).toEqual({ status: "unavailable", reason_code: "network-error" });
  });

  it("is unavailable when fetch itself rejects (network down)", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("ENETUNREACH"));
    const provider = makeJevProvider({ fetch, apiKey: async () => "k" });
    expect(await provider.decide(question, {}, 1000)).toEqual({ status: "unavailable", reason_code: "network-error" });
  });

  it("aborts the request once the time budget elapses and reports unavailable", async () => {
    const fetch = vi.fn().mockImplementation((_url, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const provider = makeJevProvider({ fetch, apiKey: async () => "k" });
    const result = await provider.decide(question, {}, 5);
    expect(result).toEqual({ status: "unavailable", reason_code: "timeout" });
  });
});
