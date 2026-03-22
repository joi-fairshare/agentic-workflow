// mcp-bridge/tests/secret-filter.test.ts
import { describe, it, expect } from "vitest";
import { createSecretFilter } from "../src/ingestion/secret-filter.js";

const filter = createSecretFilter();

describe("redact", () => {
  it.each([
    ["AWS key", "AKIAIOSFODNN7EXAMPLE"],
    ["AWS secret", 'aws_secret_access_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"'],
    ["Slack token", "xoxb-fake-test-token"],
    ["GitHub PAT", "ghp_abcdefghijklmnopqrstuvwxyz1234567890abcd"],
    ["Anthropic key", "sk-ant-api03-abcdefghijklmnopqrst"],
    ["OpenAI-style sk- key", "sk-abc123def456ghi789jk"],
    ["OpenAI-style sk- key (longer)", "sk-test123abc456def789ghi"],
    ["Bearer token", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"],
    ["PEM private key", "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQ...\n-----END RSA PRIVATE KEY-----"],
    ["Connection string", "postgres://user:pass@localhost:5432/mydb"],
    ["Password field", 'password: "super_secret_pass123"'],
    ["Env secret", 'API_SECRET_TOKEN=AbCdEfGhIjKlMnOpQrStUvWx'],
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
