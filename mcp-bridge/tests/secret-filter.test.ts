// mcp-bridge/tests/secret-filter.test.ts
import { describe, it, expect } from "vitest";
import { createSecretFilter } from "../src/ingestion/secret-filter.js";

const filter = createSecretFilter();

describe("createSecretFilter", () => {
  it("redacts AWS access keys", () => {
    const input = "Use key AKIAIOSFODNN7EXAMPLE to access S3";
    const result = filter.redact(input);
    expect(result).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts generic API keys in env-var style", () => {
    const input = 'API_KEY=sk-abc123def456ghi789jkl012mno345pqr678stu';
    const result = filter.redact(input);
    expect(result).not.toContain("sk-abc123def456ghi789jkl012mno345pqr678stu");
  });

  it("redacts Bearer tokens", () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const result = filter.redact(input);
    expect(result).not.toContain("eyJhbGciOiJIUzI1NiI");
  });

  it("redacts password fields", () => {
    const input = 'password: "SuperSecret123!"';
    const result = filter.redact(input);
    expect(result).not.toContain("SuperSecret123!");
  });

  it("redacts connection strings", () => {
    const input = "postgres://user:pass@host:5432/db";
    const result = filter.redact(input);
    expect(result).not.toContain("user:pass");
  });

  it("redacts PEM private keys", () => {
    const input = "-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBALRiMLAH\n-----END RSA PRIVATE KEY-----";
    const result = filter.redact(input);
    expect(result).not.toContain("MIIBogIBAAJBALRiMLAH");
  });

  it("redacts GitHub tokens", () => {
    const input = "token: ghp_abcdef1234567890abcdef1234567890abcd";
    const result = filter.redact(input);
    expect(result).not.toContain("ghp_abcdef1234567890abcdef1234567890abcd");
  });

  it("redacts Anthropic API keys", () => {
    const input = "ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz";
    const result = filter.redact(input);
    expect(result).not.toContain("sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
  });

  it("preserves non-secret text unchanged", () => {
    const input = "This is a normal message about code review. No secrets here.";
    expect(filter.redact(input)).toBe(input);
  });

  it("handles multiple secrets in one string", () => {
    const input = 'KEY=AKIAIOSFODNN7EXAMPLE password="secret123"';
    const result = filter.redact(input);
    expect(result).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(result).not.toContain("secret123");
  });

  it("reports whether redaction occurred", () => {
    expect(filter.hasSecrets("AKIAIOSFODNN7EXAMPLE")).toBe(true);
    expect(filter.hasSecrets("no secrets here")).toBe(false);
  });
});
