import type { Provider, ProviderResult, QuestionRef } from "../types.js";

export interface SpawnResult {
  stdout: string;
  code: number | null;
  timedOut: boolean;
}

export interface Spawn {
  (args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number }): Promise<SpawnResult>;
}

const NON_IMAGE_CLASSES = ["code", "diff", "brief", "transcript", "message-meta"] as const;
// Verified 2026-09-27 (team lead): `claude -p` accepts an image via the Read
// tool, with cwd scoped to the evidence dir (Plan 6, Task 5). Without this,
// providersFor(DEFAULT_CHAIN, "image", ...) filters claude-cli out entirely
// (Provider.classes gates every content class candidate — chain.ts, Task 3)
// and visual-critique can never be reached at all (review fix #1, BLOCKER).
const IMAGE_CLASSES = ["image"] as const;

function outputsSchema<O extends string>(outputs: readonly O[]): string {
  return JSON.stringify({
    type: "object",
    properties: { decision: { type: "string", enum: outputs } },
    required: ["decision"],
  });
}

/**
 * Haiku via the Claude Code CLI, on the user's subscription (no API key on this box).
 * Exact invocation the user measured 2026-09-26 (~2.7s wall, ~0.65s API, ~1.5k input
 * tokens with MAX_THINKING_TOKENS=0; without it, ~15s), confirmed against the
 * installed CLI (claude --version 2.1.283). Built from the question's own
 * outputs enum, so every question gets a schema for free. Runs from an empty
 * temp cwd so the child never inherits this repo's project context. Sets
 * AW_JUDGE_CHILD=1 so every aw:* hook exits 0 immediately (recursion guard).
 */
export function makeClaudeCliProvider(deps: { spawn: Spawn; tmpDirFactory: () => string }): Provider {
  return {
    name: "claude-cli",
    classes: new Set([...NON_IMAGE_CLASSES, ...IMAGE_CLASSES]),
    decide: async <O extends string>(question: QuestionRef<O>, input: unknown, budgetMs: number): Promise<ProviderResult<O>> => {
      // Image branch (Task 5, F8): uses the Read tool instead of Plan 2's
      // --tools "" structured-text invocation, with cwd scoped to the run's
      // own evidence directory — the CLI's file-access sandbox is scoped to
      // cwd, and an --allowedTools glob does not override that (an absolute
      // path outside cwd is denied even when the glob would otherwise match
      // it). Screenshots already live under this cwd (run-script.ts writes
      // them into runDir, which becomes this cwd).
      if (question.contentClass === "image") {
        const img = input as { afterScreenshot: string; baselineScreenshot: string | null; evidenceDir: string };
        const imgArgs = [
          "-p", "--model", "haiku", "--effort", "low", "--no-session-persistence",
          "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
          "--settings", '{"disableAllHooks":true,"alwaysThinkingEnabled":false}',
          "--disable-slash-commands",
          "--tools", "Read", "--allowedTools", "Read(./**)",
          "--json-schema", JSON.stringify({
            type: "object",
            properties: { decision: { type: "string", enum: question.outputs }, reasons: { type: "array", items: { type: "string" } } },
            required: ["decision"],
          }),
          "--system-prompt", "You inspect screenshots. Use the Read tool on the given path, then answer.",
          "--output-format", "json",
          question.prompt,
        ];
        let imgRaw: SpawnResult;
        try {
          imgRaw = await deps.spawn(imgArgs, {
            cwd: img.evidenceDir,
            env: { ...process.env, MAX_THINKING_TOKENS: "0", AW_JUDGE_CHILD: "1" },
            timeoutMs: budgetMs,
          });
        } catch {
          return { status: "error", reason_code: "spawn-failed" };
        }
        if (imgRaw.timedOut) return { status: "unavailable", reason_code: "timeout" };
        if (imgRaw.code !== 0) return { status: "error", reason_code: `exit-${imgRaw.code ?? "null"}` };
        let imgEnvelope: unknown;
        try {
          imgEnvelope = JSON.parse(imgRaw.stdout);
        } catch {
          return { status: "error", reason_code: "unparseable-output" };
        }
        const imgStructured = (imgEnvelope as { structured_output?: unknown }).structured_output;
        let imgParsed: unknown = imgStructured;
        if (imgParsed === undefined) {
          const resultField = (imgEnvelope as { result?: unknown }).result;
          if (typeof resultField !== "string") return { status: "error", reason_code: "unparseable-result" };
          try {
            imgParsed = JSON.parse(resultField);
          } catch {
            return { status: "error", reason_code: "unparseable-result" };
          }
        }
        const imgDecision = (imgParsed as { decision?: unknown } | undefined)?.decision;
        if (typeof imgDecision !== "string") return { status: "error", reason_code: "unparseable-result" };
        const { decision: _imgDecision, ...imgRest } = imgParsed as Record<string, unknown>;
        const imgExtra = Object.keys(imgRest).length > 0 ? imgRest : undefined;
        return imgExtra === undefined
          ? { status: "decided", decision: imgDecision as O, confidence: 1, reason_code: "claude-cli" }
          : { status: "decided", decision: imgDecision as O, confidence: 1, reason_code: "claude-cli", extra: imgExtra };
      }

      const args = [
        "-p",
        "--model", "haiku",
        "--effort", "low",
        "--no-session-persistence",
        "--strict-mcp-config",
        "--mcp-config", '{"mcpServers":{}}',
        "--settings", '{"disableAllHooks":true,"alwaysThinkingEnabled":false}',
        "--disable-slash-commands",
        "--tools", "",
        "--system-prompt", question.prompt,
        "--json-schema", outputsSchema(question.outputs),
        "--output-format", "json",
        JSON.stringify(input),
      ];
      const cwd = deps.tmpDirFactory();
      let raw: SpawnResult;
      try {
        raw = await deps.spawn(args, {
          cwd,
          env: { ...process.env, MAX_THINKING_TOKENS: "0", AW_JUDGE_CHILD: "1" },
          timeoutMs: budgetMs,
        });
      } catch {
        return { status: "error", reason_code: "spawn-failed" };
      }
      if (raw.timedOut) return { status: "unavailable", reason_code: "timeout" };
      if (raw.code !== 0) return { status: "error", reason_code: `exit-${raw.code ?? "null"}` };

      let envelope: unknown;
      try {
        envelope = JSON.parse(raw.stdout);
      } catch {
        return { status: "error", reason_code: "unparseable-output" };
      }

      // .structured_output is the primary path (validated against the schema
      // above by the CLI itself). Fall back to parsing .result as JSON only
      // when .structured_output is absent — never trust free-form prose.
      const structured = (envelope as { structured_output?: unknown }).structured_output;
      let parsed: unknown = structured;
      if (parsed === undefined) {
        const resultField = (envelope as { result?: unknown }).result;
        if (typeof resultField !== "string") return { status: "error", reason_code: "unparseable-result" };
        try {
          parsed = JSON.parse(resultField);
        } catch {
          return { status: "error", reason_code: "unparseable-result" };
        }
      }
      const decision = (parsed as { decision?: unknown } | undefined)?.decision;
      if (typeof decision !== "string") return { status: "error", reason_code: "unparseable-result" };
      // Anything the model returned beyond `decision` (ui-element-repair's
      // chosenIndex, visual-critique's reasons) rides through as `extra` —
      // never part of evaluate()'s typed Decision<O> contract (see types.ts).
      const { decision: _decision, ...rest } = parsed as Record<string, unknown>;
      const extra = Object.keys(rest).length > 0 ? rest : undefined;
      return extra === undefined
        ? { status: "decided", decision: decision as O, confidence: 1, reason_code: "claude-cli" }
        : { status: "decided", decision: decision as O, confidence: 1, reason_code: "claude-cli", extra };
    },
  };
}
