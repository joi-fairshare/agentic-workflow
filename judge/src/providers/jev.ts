import type { Provider, ProviderResult, QuestionRef } from "../types.js";

const MAX_CHOICE_OPTIONS = 255;
const JEV_MODEL = "jev-1.13.0";
const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const QUESTION_KEY = "decision";

export interface Fetch {
  (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }): Promise<{ status: number; json(): Promise<unknown> }>;
}

interface ChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities?: Record<string, number>;
  confidence?: number;
}

/**
 * Confirmed against docs.typesafe.ai/api (2026-09-28, key live): one endpoint
 * (POST /v1/systemone), body is `{ state, model, questions: { <id>: Question } }`,
 * a `choice` question takes `criteria: { option: description }`, and the
 * response is `{ model, answers: { <id>: Answer }, usage }` where a choice
 * answer is `{ type: "choice", choice, probabilities, confidence }`. This
 * replaces the placeholder question/options/answer/confidence shape shipped
 * before the key landed (see git history on this file for the prior version).
 */
export function makeJevProvider(deps: { fetch: Fetch; apiKey: () => Promise<string | null> }): Provider {
  return {
    name: "jev",
    classes: new Set(["message-meta"]),
    decide: async <O extends string>(question: QuestionRef<O>, input: unknown, budgetMs: number): Promise<ProviderResult<O>> => {
      if (question.outputs.length > MAX_CHOICE_OPTIONS) return { status: "error", reason_code: "too-many-options" };
      const apiKey = await deps.apiKey();
      if (apiKey === null) return { status: "unavailable", reason_code: "no-api-key" };

      const criteria: Record<string, string> = {};
      for (const option of question.outputs) criteria[option] = option;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), budgetMs);
      try {
        const response = await deps.fetch(JEV_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            state: input,
            model: JEV_MODEL,
            questions: {
              [QUESTION_KEY]: { type: "choice", instructions: question.prompt, criteria },
            },
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (response.status < 200 || response.status >= 300) return { status: "error", reason_code: `http-${response.status}` };
        const body = (await response.json()) as { answers?: Record<string, ChoiceAnswer> };
        const answer = body.answers?.[QUESTION_KEY];
        if (answer === undefined || answer.type !== "choice" || typeof answer.choice !== "string" || !question.outputs.includes(answer.choice as O)) {
          return { status: "error", reason_code: "unparseable-result" };
        }
        const confidence = typeof answer.confidence === "number" ? answer.confidence : 1;
        return { status: "decided", decision: answer.choice as O, confidence, reason_code: "jev" };
      } catch (e) {
        clearTimeout(timer);
        if (e instanceof DOMException && e.name === "AbortError") return { status: "unavailable", reason_code: "timeout" };
        return { status: "unavailable", reason_code: "network-error" };
      }
    },
  };
}
