// mcp-bridge/tests/secret-filter.test.ts
import { describe, it, expect } from "vitest";
import { createSecretFilter } from "../src/ingestion/secret-filter.js";

const filter = createSecretFilter();

describe("redact", () => {
  it.each([
    ["AWS key", "AKIAIOSFODNN7EXAMPLE"],
    ["OpenAI-style sk- key", "sk-abc123def456ghi789jk"],
    ["OpenAI-style sk- key (longer)", "sk-test123abc456def789ghi"],
    ["GitHub PAT", "ghp_abcdefghijklmnopqrstuvwxyz1234567890abcd"],
  ])("redacts %s", (_label, input) => {
    expect(filter.redact(input)).toContain("[REDACTED]");
  });

  it("does not redact normal text", () => {
    const text = "This is normal text without secrets";
    expect(filter.redact(text)).toBe(text);
  });

  it("redacts multiple secrets in one string", () => {
    const text = "Key: AKIAIOSFODNN7EXAMPLE and token: ghp_abcdefghijklmnopqrstuvwxyz1234567890abcd";
    const result = filter.redact(text);
    expect(result).not.toContain("AKIAIOSFODNN7");
    expect(result).not.toContain("ghp_abcdef");
  });
});

describe("hasSecrets", () => {
  it("returns true for text containing secrets", () => {
    expect(filter.hasSecrets("my key is sk-abc123def456ghi789jk")).toBe(true);
  });

  it("returns false for clean text", () => {
    expect(filter.hasSecrets("no secrets here")).toBe(false);
  });

  it("short-circuits on first match", () => {
    expect(filter.hasSecrets("AKIAIOSFODNN7EXAMPLE")).toBe(true);
  });
});
