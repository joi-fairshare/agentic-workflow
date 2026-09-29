import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { discoverFiles } from "../src/transcript/discover.js";
import { tmpDir } from "./helpers.js";

describe("discoverFiles", () => {
  it("finds main and subagent transcripts with their agent types", () => {
    const root = tmpDir();
    const proj = path.join(root, "-Users-dev-acme-web-app");
    fs.mkdirSync(path.join(proj, "s1", "subagents"), { recursive: true });
    fs.writeFileSync(path.join(proj, "s1.jsonl"), "");
    fs.writeFileSync(path.join(proj, "s1", "subagents", "agent-a1.jsonl"), "");
    fs.writeFileSync(path.join(proj, "s1", "subagents", "agent-a1.meta.json"), JSON.stringify({ agentType: "Explore" }));
    fs.writeFileSync(path.join(proj, "s1", "subagents", "agent-a2.jsonl"), "");
    fs.writeFileSync(path.join(proj, "s1", "subagents", "agent-a3.jsonl"), "");
    fs.writeFileSync(path.join(proj, "s1", "subagents", "agent-a3.meta.json"), "{broken");
    fs.writeFileSync(path.join(proj, "s1", "subagents", "agent-a4.jsonl"), "");
    fs.writeFileSync(path.join(proj, "s1", "subagents", "agent-a4.meta.json"), JSON.stringify({ agentType: 5 }));
    fs.writeFileSync(path.join(proj, "notes.txt"), "");
    fs.mkdirSync(path.join(proj, "s2"));
    fs.writeFileSync(path.join(root, "stray.jsonl"), "");

    const files = discoverFiles(root).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    expect(files).toEqual([
      { provider: "claude", path: path.join(proj, "s1.jsonl"), project: "-Users-dev-acme-web-app", sessionId: "s1", agentId: "main", agentType: "main", isMain: true },
      { provider: "claude", path: path.join(proj, "s1", "subagents", "agent-a1.jsonl"), project: "-Users-dev-acme-web-app", sessionId: "s1", agentId: "a1", agentType: "Explore", isMain: false },
      { provider: "claude", path: path.join(proj, "s1", "subagents", "agent-a2.jsonl"), project: "-Users-dev-acme-web-app", sessionId: "s1", agentId: "a2", agentType: "unknown", isMain: false },
      { provider: "claude", path: path.join(proj, "s1", "subagents", "agent-a3.jsonl"), project: "-Users-dev-acme-web-app", sessionId: "s1", agentId: "a3", agentType: "unknown", isMain: false },
      { provider: "claude", path: path.join(proj, "s1", "subagents", "agent-a4.jsonl"), project: "-Users-dev-acme-web-app", sessionId: "s1", agentId: "a4", agentType: "unknown", isMain: false },
    ]);
  });

  it("groups an in-process teammate's subagent transcript under agentType 'teammate'", () => {
    const root = tmpDir();
    const proj = path.join(root, "-Users-dev-acme-web-app");
    fs.mkdirSync(path.join(proj, "s1", "subagents"), { recursive: true });
    fs.writeFileSync(path.join(proj, "s1", "subagents", "agent-tc-16892.jsonl"), "");
    fs.writeFileSync(
      path.join(proj, "s1", "subagents", "agent-tc-16892.meta.json"),
      JSON.stringify({ agentType: "tc-16892", name: "tc-16892", taskKind: "in_process_teammate", model: "sonnet" }),
    );

    const [file] = discoverFiles(root);
    expect(file).toMatchObject({ agentId: "tc-16892", agentType: "teammate", isMain: false });
  });

  it("returns nothing for a missing directory", () => {
    expect(discoverFiles(path.join(tmpDir(), "nope"))).toEqual([]);
  });
});
