#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import {
  runApprove, runAskCheckCli, runBriefGet, runBriefMapByDispatch, runBriefMapByName, runBriefSave, runBriefSetAgentId,
  runConfigGet, runConfigSet, runHealth, runQuestion, runUiElementRepairCli, runUndo, runVisualCritiqueCli, runWhy,
} from "./commands.js";
import { buildChain } from "./chain.js";
import { judgeConfigPath, judgeDbPath, loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { AGENT_CLI_BINARIES, isOnPath, resolveAgentClis } from "./detect.js";
import { makeClaudeCliProvider } from "./providers/claude-cli.js";
import { makeCodexCliProvider } from "./providers/codex-cli.js";
import { makeCursorCliProvider } from "./providers/cursor-cli.js";
import { makeExecSpawn } from "./providers/exec-spawn.js";
import { makeJevProvider } from "./providers/jev.js";
import { makeRulesProvider } from "./providers/rules.js";
import { readApiKey } from "./keychain.js";
import type { AgentCliName, Provider } from "./types.js";

const exec = promisify(execFile);
// AW_STATE_DIR overrides ~/.agentic-workflow wholesale, so a smoke run or a
// test harness can point at a scratch state dir while still using the real
// HOME (and its real agent-CLI logins) for everything else.
const dbPath = judgeDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = openDb(dbPath);
const config = loadConfig(judgeConfigPath());

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function readKeychain(service: string, account: string): Promise<string | null> {
  try {
    const { stdout } = await exec("security", ["find-generic-password", "-s", service, "-a", account, "-w"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

const tmpDirFactory = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "judge-cli-"));

const agentCliFactories: Record<AgentCliName, () => Provider> = {
  "claude-cli": () => makeClaudeCliProvider({ tmpDirFactory, spawn: makeExecSpawn(AGENT_CLI_BINARIES["claude-cli"]) }),
  "codex-cli": () =>
    makeCodexCliProvider({ tmpDirFactory, spawn: makeExecSpawn(AGENT_CLI_BINARIES["codex-cli"]), writeFile: (file, contents) => fs.writeFileSync(file, contents) }),
  "cursor-cli": () => makeCursorCliProvider({ tmpDirFactory, spawn: makeExecSpawn(AGENT_CLI_BINARIES["cursor-cli"]) }),
};

// Agent CLIs: installed ones only, config order > AW_PROVIDER > claude, codex, cursor.
const agentClis = resolveAgentClis({
  available: (name) => isOnPath(AGENT_CLI_BINARIES[name], process.env),
  awProvider: process.env.AW_PROVIDER,
  configured: config.providers?.agentClis,
});
const chain = buildChain({ agentClis, jev: config.providers?.jev ?? true });

const providers: Provider[] = [
  makeRulesProvider(),
  ...agentClis.map((name) => agentCliFactories[name]()),
  makeJevProvider({ fetch: (...args) => fetch(...args), apiKey: () => readApiKey({ env: process.env, readKeychain }) }),
];

const [, , cmd, ...rest] = process.argv;

async function main(): Promise<{ exitCode: number; stdout: string; stderr?: string }> {
  switch (cmd) {
    case "undo":
      return runUndo(db, rest[0] ?? "", () => new Date());
    case "why":
      return runWhy(db, rest[0] ?? "");
    case "approve":
      return runApprove(db, rest[0] ?? "");
    case "health":
      return runHealth(db);
    case "config": {
      if (rest[0] === "get") return runConfigGet();
      if (rest[0] === "set") return runConfigSet(rest[1] ?? "", rest[2] as "enabled" | "threshold", rest[3] ?? "");
      return { exitCode: 1, stdout: "", stderr: "usage: judge config get|set <question> <enabled|threshold> <value>" };
    }
    case "brief": {
      const sub = rest[0];
      if (sub === "save") {
        const raw = await readStdin();
        let input: unknown;
        try {
          input = JSON.parse(raw);
        } catch {
          return { exitCode: 1, stdout: "", stderr: "input is not valid JSON" };
        }
        return runBriefSave(db, input);
      }
      if (sub === "get") return runBriefGet(db, rest[1] ?? "");
      if (sub === "map-by-name") return runBriefMapByName(db, rest[1] ?? "");
      if (sub === "map-by-dispatch") return runBriefMapByDispatch(db, rest[1] ?? "", rest[2] ?? "", rest[3] ?? "");
      if (sub === "set-agent-id") return runBriefSetAgentId(db, rest[1] ?? "", rest[2] ?? "");
      return { exitCode: 1, stdout: "", stderr: "usage: judge brief save|get|map-by-name|map-by-dispatch|set-agent-id ..." };
    }
    default: {
      if (cmd === undefined) return { exitCode: 1, stdout: "", stderr: "usage: judge <question> < input.json" };
      const raw = await readStdin();
      let input: unknown;
      try {
        input = JSON.parse(raw);
      } catch {
        return { exitCode: 1, stdout: "", stderr: "input is not valid JSON" };
      }
      // ui-element-repair (and visual-critique, below) get a dedicated thin
      // subcommand instead of the generic runQuestion envelope — each carries
      // a field (chosenIndex, reasons) that rides in a provider's `extra`
      // rather than evaluate()'s typed Decision<O> (review fix #2).
      if (cmd === "ui-element-repair") return runUiElementRepairCli(input, { db, config, providers, chain });
      if (cmd === "visual-critique") return runVisualCritiqueCli(input, { db, config, providers, chain });
      if (cmd === "ask-check") return runAskCheckCli(input, { db, config, providers, chain });
      return runQuestion(cmd, input, { db, config, providers, chain });
    }
  }
}

const result = await main();
if (result.stdout) process.stdout.write(result.stdout + "\n");
if (result.stderr) process.stderr.write(result.stderr + "\n");
process.exit(result.exitCode);
