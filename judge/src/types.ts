export type ContentClass = "code" | "diff" | "brief" | "transcript" | "message-meta" | "image";

export type ProviderName = "rules" | "claude-cli" | "jev";

export interface Decision<O extends string> {
  decision: O;
  confidence: number;
  model: ProviderName;
  reason_code: string;
  id: string;
  extra?: Record<string, unknown>;
}

export type ProviderResult<O extends string> =
  // `extra` carries fields a provider's raw response has beyond the enum
  // decision itself (ui-element-repair's chosenIndex, visual-critique's
  // reasons) — never part of evaluate()'s typed Decision<O> contract, but
  // threaded through so a dedicated thin CLI subcommand can surface it
  // without evaluate() itself gaining a new shape.
  | { status: "decided"; decision: O; confidence: number; reason_code: string; extra?: Record<string, unknown> }
  | { status: "unavailable"; reason_code: string }
  | { status: "error"; reason_code: string };

// QuestionModule is defined fully in src/question.ts (Task 3). This alias lets
// provider.ts (Task 4) reference it without a circular import: providers take
// an already-narrowed prompt string and schema, not the whole module.
export interface QuestionRef<O extends string> {
  name: string;
  outputs: readonly O[];
  prompt: string;
  contentClass: ContentClass;
}

export interface Provider {
  name: ProviderName;
  classes: ReadonlySet<ContentClass>;
  decide<O extends string>(question: QuestionRef<O>, input: unknown, budgetMs: number): Promise<ProviderResult<O>>;
}
