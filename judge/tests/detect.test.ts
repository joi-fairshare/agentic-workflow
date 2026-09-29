import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { agentCliFromEnv, AGENT_CLI_BINARIES, DEFAULT_AGENT_CLI_ORDER, isAgentCliName, isOnPath, resolveAgentClis } from "../src/detect.js";
import type { AgentCliName } from "../src/types.js";

describe("AGENT_CLI_BINARIES", () => {
  it("maps each agent CLI provider to its host's headless binary (planning/PROVIDERS.md)", () => {
    expect(AGENT_CLI_BINARIES).toEqual({ "claude-cli": "claude", "codex-cli": "codex", "cursor-cli": "cursor-agent" });
    expect(DEFAULT_AGENT_CLI_ORDER).toEqual(["claude-cli", "codex-cli", "cursor-cli"]);
  });
});

describe("isAgentCliName", () => {
  it("accepts only the three agent CLI names", () => {
    expect(isAgentCliName("codex-cli")).toBe(true);
    expect(isAgentCliName("jev")).toBe(false);
    expect(isAgentCliName(5)).toBe(false);
  });
});

describe("isOnPath", () => {
  it("checks each PATH entry, skipping empty ones", () => {
    const seen: string[] = [];
    const found = isOnPath("codex", { PATH: `/a${path.delimiter}${path.delimiter}/b` }, (file) => {
      seen.push(file);
      return file === "/b/codex";
    });
    expect(found).toBe(true);
    expect(seen).toEqual(["/a/codex", "/b/codex"]);
  });

  it("is false with no PATH", () => {
    expect(isOnPath("codex", {}, () => true)).toBe(false);
  });

  it("uses a real executable check by default (file must exist, be executable, and not be a directory)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "judge-detect-"));
    fs.writeFileSync(path.join(dir, "exe"), "#!/bin/sh\n", { mode: 0o755 });
    fs.writeFileSync(path.join(dir, "plain"), "", { mode: 0o644 });
    fs.mkdirSync(path.join(dir, "adir"));
    const env = { PATH: dir };
    expect(isOnPath("exe", env)).toBe(true);
    expect(isOnPath("plain", env)).toBe(false);
    expect(isOnPath("adir", env)).toBe(false);
    expect(isOnPath("missing", env)).toBe(false);
  });
});

describe("agentCliFromEnv", () => {
  it("accepts host names and provider names, case- and whitespace-insensitively", () => {
    expect(agentCliFromEnv("codex")).toBe("codex-cli");
    expect(agentCliFromEnv(" Cursor ")).toBe("cursor-cli");
    expect(agentCliFromEnv("claude-cli")).toBe("claude-cli");
  });

  it("ignores unset and unknown values", () => {
    expect(agentCliFromEnv(undefined)).toBeUndefined();
    expect(agentCliFromEnv("gemini")).toBeUndefined();
  });
});

describe("resolveAgentClis", () => {
  const all = (): boolean => true;
  const only = (...names: AgentCliName[]) => (name: AgentCliName): boolean => names.includes(name);

  it("defaults to claude, codex, cursor — filtered to what's installed", () => {
    expect(resolveAgentClis({ available: all })).toEqual(["claude-cli", "codex-cli", "cursor-cli"]);
    expect(resolveAgentClis({ available: only("cursor-cli", "codex-cli") })).toEqual(["codex-cli", "cursor-cli"]);
  });

  it("keeps existing behavior when only claude is installed", () => {
    expect(resolveAgentClis({ available: only("claude-cli") })).toEqual(["claude-cli"]);
    expect(resolveAgentClis({ available: only("claude-cli"), awProvider: "codex" })).toEqual(["claude-cli"]);
  });

  it("moves the AW_PROVIDER host to the front", () => {
    expect(resolveAgentClis({ available: all, awProvider: "cursor" })).toEqual(["cursor-cli", "claude-cli", "codex-cli"]);
    expect(resolveAgentClis({ available: all, awProvider: "nonsense" })).toEqual(["claude-cli", "codex-cli", "cursor-cli"]);
  });

  it("lets an explicit config list win over AW_PROVIDER, deduplicated and filtered to installed", () => {
    expect(resolveAgentClis({ available: only("codex-cli", "claude-cli"), awProvider: "claude", configured: ["codex-cli", "cursor-cli", "codex-cli", "claude-cli"] }))
      .toEqual(["codex-cli", "claude-cli"]);
    expect(resolveAgentClis({ available: all, configured: [] })).toEqual([]);
  });
});
