import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isProviderName, projectFromCwd, readFirstLine, stripLeadingTagBlocks } from "../src/transcript/source.js";
import { claudeSource, providerForPath, SOURCES } from "../src/transcript/sources.js";
import { assistant, tmpDir } from "./helpers.js";

describe("transcript source helpers", () => {
  it("recognizes provider names", () => {
    expect(isProviderName("codex")).toBe(true);
    expect(isProviderName("gemini")).toBe(false);
  });

  it("encodes a cwd the way Claude names project directories", () => {
    expect(projectFromCwd("/Users/dev/acme.web_app")).toBe("-Users-dev-acme-web-app");
  });

  it("strips leading context blocks but keeps unclosed or later tags", () => {
    expect(stripLeadingTagBlocks("  <a x=\"1\">ctx</a>\n<b>more</b> hello <c>kept</c>")).toBe("hello <c>kept</c>");
    expect(stripLeadingTagBlocks("<open>never closed")).toBe("<open>never closed");
    expect(stripLeadingTagBlocks("plain")).toBe("plain");
  });

  it("reads only the first line, across chunk boundaries, up to a cap", () => {
    const dir = tmpDir();
    const long = path.join(dir, "long.jsonl");
    fs.writeFileSync(long, `${"a".repeat(70_000)}\nsecond\n`);
    expect(readFirstLine(long)).toBe("a".repeat(70_000));
    const noNewline = path.join(dir, "nonl.jsonl");
    fs.writeFileSync(noNewline, "only");
    expect(readFirstLine(noNewline)).toBe("only");
    const capped = path.join(dir, "capped.jsonl");
    fs.writeFileSync(capped, "b".repeat(70_000));
    expect(readFirstLine(capped, 65_536).length).toBe(65_536);
  });

  it("maps paths to providers and exposes one source per provider", () => {
    expect(providerForPath("/Users/d/.codex/sessions/2026/09/26/rollout-x.jsonl")).toBe("codex");
    expect(providerForPath("/Users/d/.codex/archived_sessions/rollout-x.jsonl")).toBe("codex");
    expect(providerForPath("/Users/d/.cursor/projects/p/agent-transcripts/i/i.jsonl")).toBe("cursor");
    expect(providerForPath("/Users/d/.claude/projects/p/s.jsonl")).toBe("claude");
    expect(Object.keys(SOURCES)).toEqual(["claude", "codex", "cursor"]);
    const parser = claudeSource.createParser({ provider: "claude", path: "/x", project: "p", sessionId: "s1", agentId: "main", agentType: "main", isMain: true });
    expect(parser.parse(assistant({ id: "m1", ts: "2026-09-26T10:00:00.000Z" }), 0).records[0]).toMatchObject({ t: "call", messageId: "m1" });
  });
});
