import type { ZodType } from "zod";

import type { ContentClass, JsonSchemaFragment, QuestionRef } from "./types.js";

export interface QuestionModule<I, O extends string> {
  name: string;
  inputSchema: ZodType<I>;
  outputs: readonly O[];
  prompt: (input: I) => string;
  threshold: number;
  contentClass: ContentClass;
  timeBudgetMs: number;
  preRules?: (input: I) => O | null;
  extraProperties?: Readonly<Record<string, JsonSchemaFragment>>;
}

export function toRef<I, O extends string>(q: QuestionModule<I, O>, input: I): QuestionRef<O> {
  const ref: QuestionRef<O> = { name: q.name, outputs: q.outputs, prompt: q.prompt(input), contentClass: q.contentClass };
  return q.extraProperties === undefined ? ref : { ...ref, extraProperties: q.extraProperties };
}
