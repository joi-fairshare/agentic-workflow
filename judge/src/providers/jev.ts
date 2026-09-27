import type { Provider, ProviderResult, QuestionRef } from "../types.js";

const MAX_CHOICE_OPTIONS = 255;
const JEV_MODEL = "jev-1.13.0";
const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

export interface Fetch {
  (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }): Promise<{ status: number; json(): Promise<unknown> }>;
}

/**
 * Confirmed against docs.typesafe.ai (2026-09-26): one endpoint (POST
 * /v1/systemone) for every model, `model` in the body selects jev-1.13.0,
 * auth is `Authorization: Bearer <key>`. NOT confirmed by the docs: the
 * `question`/`options`/`answer`/`confidence` field names below — the docs
 * describe a Choice question and a speculative-fan-out batching pattern in
 * prose only, with no field-level schema. Verify against the real API on
 * Monday (2026-09-28) once the key lands; see plan Task 5.
 */
export function makeJevProvider(deps: { fetch: Fetch; apiKey: () => Promise<string | null> }): Provider {
  return {
    name: "jev",
    classes: new Set(["message-meta"]),
    decide: async <O extends string>(question: QuestionRef<O>, input: unknown, budgetMs: number): Promise<ProviderResult<O>> => {
      if (question.outputs.length > MAX_CHOICE_OPTIONS) return { status: "error", reason_code: "too-many-options" };
      const apiKey = await deps.apiKey();
      if (apiKey === null) return { status: "unavailable", reason_code: "no-api-key" };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), budgetMs);
      try {
        const response = await deps.fetch(JEV_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: JEV_MODEL, question: question.prompt, options: question.outputs, state: input }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (response.status < 200 || response.status >= 300) return { status: "error", reason_code: `http-${response.status}` };
        const body = (await response.json()) as { answer?: unknown; confidence?: unknown };
        if (typeof body.answer !== "string" || !question.outputs.includes(body.answer as O)) {
          return { status: "error", reason_code: "unparseable-result" };
        }
        const confidence = typeof body.confidence === "number" ? body.confidence : 1;
        return { status: "decided", decision: body.answer as O, confidence, reason_code: "jev" };
      } catch (e) {
        clearTimeout(timer);
        if (e instanceof DOMException && e.name === "AbortError") return { status: "unavailable", reason_code: "timeout" };
        return { status: "unavailable", reason_code: "network-error" };
      }
    },
  };
}
