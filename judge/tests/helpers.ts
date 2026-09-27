import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ContentClass, Provider, ProviderName, ProviderResult, QuestionRef } from "../src/types.js";

export function tmpDb(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "judge-"));
  return path.join(dir, "decisions.sqlite");
}

export function fakeProvider<O extends string>(
  name: ProviderName,
  classes: ContentClass[],
  result: ProviderResult<O> | ((question: QuestionRef<O>, input: unknown) => ProviderResult<O>),
): Provider {
  return {
    name,
    classes: new Set(classes),
    decide: async (question, input) =>
      (typeof result === "function" ? (result as (q: QuestionRef<O>, i: unknown) => ProviderResult<O>)(question as QuestionRef<O>, input) : result) as ProviderResult<O>,
  };
}
