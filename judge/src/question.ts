import type { ZodType } from "zod";

import type { ContentClass, QuestionRef } from "./types.js";

export interface QuestionModule<I, O extends string> {
  name: string;
  inputSchema: ZodType<I>;
  outputs: readonly O[];
  prompt: (input: I) => string;
  threshold: number;
  contentClass: ContentClass;
  timeBudgetMs: number;
  preRules?: (input: I) => O | null;
}

export function toRef<I, O extends string>(q: QuestionModule<I, O>, input: I): QuestionRef<O> {
  return { name: q.name, outputs: q.outputs, prompt: q.prompt(input), contentClass: q.contentClass };
}
