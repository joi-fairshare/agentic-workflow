import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface JudgeQuestionConfig {
  enabled: boolean;
  threshold: number;
}

export interface JudgeConfig {
  questions: Record<string, JudgeQuestionConfig>;
}

export const DEFAULT_CONFIG: JudgeConfig = {
  questions: {
    "wake-gate": { enabled: true, threshold: 0.7 },
  },
};

export function configPath(home?: string): string {
  return path.join(home ?? os.homedir(), ".agentic-workflow", "judge", "config.json");
}

// The per-box state root (spec: "Per-box state lives under ~/.agentic-workflow/").
// AW_STATE_DIR overrides it wholesale — used so tests and smoke runs can point
// at a scratch directory while still using the real HOME (and its real
// `claude` login) for everything else.
export function judgeStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.AW_STATE_DIR;
  if (override !== undefined && override !== "") return override;
  return path.join(os.homedir(), ".agentic-workflow");
}

export function judgeConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(judgeStateDir(env), "judge", "config.json");
}

export function judgeDbPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(judgeStateDir(env), "judge", "decisions.sqlite");
}

export function loadConfig(file: string, defaults: JudgeConfig = DEFAULT_CONFIG): JudgeConfig {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof raw !== "object" || raw === null) return defaults;
    const questions = (raw as { questions?: unknown }).questions;
    if (typeof questions !== "object" || questions === null || Array.isArray(questions)) return defaults;
    return { questions: { ...defaults.questions, ...(questions as Record<string, JudgeQuestionConfig>) } };
  } catch {
    return defaults;
  }
}
