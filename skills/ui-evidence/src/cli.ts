// CLI: node dist/bin.js <script.json> <run-dir> [--baseline png] [--app-build id]
//                       [--fixtures id] [--cache manifest.json]
// Exit 0 = every step passed; 1 = bad usage/script; 2 = at least one step
// failed or broken (the summary is still written and printed).
import fs from "node:fs";

import type { RunOptions } from "./run-script.js";
import type { RunSummary } from "./publish.js";
import { parseUiScript, type UiScript } from "./script-schema.js";

export interface CliDeps {
  run: (script: UiScript, runDir: string, baseline: string | undefined, opts: RunOptions) => Promise<RunSummary>;
  readFile: (file: string) => string;
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE = "usage: ui-evidence <script.json> <run-dir> [--baseline png] [--app-build id] [--fixtures id] [--cache manifest.json]";
const FLAGS: Record<string, "baseline" | "appBuild" | "fixtures" | "cacheManifest"> = {
  "--baseline": "baseline",
  "--app-build": "appBuild",
  "--fixtures": "fixtures",
  "--cache": "cacheManifest",
};

export async function main(argv: string[], deps: CliDeps): Promise<number> {
  const [scriptFile, runDir, ...rest] = argv;
  if (scriptFile === undefined || runDir === undefined) return fail(deps, USAGE);

  const opts: Partial<Record<"baseline" | "appBuild" | "fixtures" | "cacheManifest", string>> = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = FLAGS[rest[i] as string];
    const value = rest[i + 1];
    if (key === undefined || value === undefined) return fail(deps, USAGE);
    opts[key] = value;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(deps.readFile(scriptFile));
  } catch (e) {
    return fail(deps, `cannot read script ${scriptFile}: ${(e as Error).message}`);
  }
  const script = parseUiScript(raw);
  if ("error" in script) return fail(deps, `invalid script: ${script.error}`);

  const { baseline, ...runOpts } = opts;
  const summary = await deps.run(script, runDir, baseline, runOpts);
  deps.out(JSON.stringify(summary));
  return summary.steps.every((s) => s.status === "passed") ? 0 : 2;
}

function fail(deps: CliDeps, message: string): number {
  deps.err(message);
  return 1;
}

export const realDeps = (run: CliDeps["run"]): CliDeps => ({
  run,
  readFile: (f) => fs.readFileSync(f, "utf8"),
  out: (l) => console.log(l),
  err: (l) => console.error(l),
});
