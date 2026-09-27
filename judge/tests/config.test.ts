import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { configPath, DEFAULT_CONFIG, judgeConfigPath, judgeDbPath, judgeStateDir, loadConfig } from "../src/config.js";

describe("configPath", () => {
  it("defaults under the given home", () => {
    expect(configPath("/home/user")).toBe("/home/user/.agentic-workflow/judge/config.json");
  });
  it("defaults to os.homedir() when no home is given", () => {
    expect(configPath()).toBe(path.join(os.homedir(), ".agentic-workflow", "judge", "config.json"));
  });
});

describe("judgeStateDir", () => {
  it("defaults to ~/.agentic-workflow when AW_STATE_DIR is unset", () => {
    expect(judgeStateDir({})).toBe(path.join(os.homedir(), ".agentic-workflow"));
  });

  it("uses AW_STATE_DIR when set", () => {
    expect(judgeStateDir({ AW_STATE_DIR: "/tmp/scratch-state" })).toBe("/tmp/scratch-state");
  });

  it("treats an empty-string AW_STATE_DIR as unset", () => {
    expect(judgeStateDir({ AW_STATE_DIR: "" })).toBe(path.join(os.homedir(), ".agentic-workflow"));
  });

  it("defaults to process.env when no env is passed", () => {
    expect(judgeStateDir()).toBe(path.join(os.homedir(), ".agentic-workflow"));
  });
});

describe("judgeConfigPath / judgeDbPath", () => {
  it("join judge/config.json and judge/decisions.sqlite onto the state dir", () => {
    const env = { AW_STATE_DIR: "/tmp/scratch-state" };
    expect(judgeConfigPath(env)).toBe("/tmp/scratch-state/judge/config.json");
    expect(judgeDbPath(env)).toBe("/tmp/scratch-state/judge/decisions.sqlite");
  });

  it("default to the real state dir when AW_STATE_DIR is unset", () => {
    expect(judgeConfigPath({})).toBe(path.join(os.homedir(), ".agentic-workflow", "judge", "config.json"));
    expect(judgeDbPath({})).toBe(path.join(os.homedir(), ".agentic-workflow", "judge", "decisions.sqlite"));
  });
});

describe("loadConfig", () => {
  it("returns defaults when the file is missing", () => {
    expect(loadConfig(path.join(os.tmpdir(), "judge-config-missing-" + Date.now() + ".json"))).toEqual(DEFAULT_CONFIG);
  });

  it("merges a partial file over defaults, question by question", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "judge-cfg-")), "config.json");
    fs.writeFileSync(file, JSON.stringify({ questions: { "wake-gate": { enabled: false, threshold: 0.9 } } }));
    expect(loadConfig(file)).toEqual({ questions: { "wake-gate": { enabled: false, threshold: 0.9 } } });
  });

  it("merges a file that overrides only one of two default questions, keeping the other default intact", () => {
    const withTwoDefaults = { questions: { "wake-gate": { enabled: true, threshold: 0.7 }, "other-q": { enabled: true, threshold: 0.5 } } };
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "judge-cfg-")), "config.json");
    fs.writeFileSync(file, JSON.stringify({ questions: { "wake-gate": { enabled: false, threshold: 0.99 } } }));
    expect(loadConfig(file, withTwoDefaults)).toEqual({
      questions: {
        "wake-gate": { enabled: false, threshold: 0.99 },
        "other-q": { enabled: true, threshold: 0.5 },
      },
    });
  });

  it("falls back to defaults on invalid JSON, without throwing", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "judge-cfg-")), "config.json");
    fs.writeFileSync(file, "{not json");
    expect(loadConfig(file)).toEqual(DEFAULT_CONFIG);
  });

  it("falls back to defaults when the top-level JSON value itself isn't an object", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "judge-cfg-")), "config.json");
    fs.writeFileSync(file, "5");
    expect(loadConfig(file)).toEqual(DEFAULT_CONFIG);
  });

  it("falls back to defaults when questions is not an object", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "judge-cfg-")), "config.json");
    fs.writeFileSync(file, JSON.stringify({ questions: "nope" }));
    expect(loadConfig(file)).toEqual(DEFAULT_CONFIG);
  });
});
