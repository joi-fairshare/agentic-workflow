// mcp-bridge/src/ingestion/secret-filter.ts

// ── Secret pattern definitions ───────────────────────────────

interface SecretPattern {
  name: string;
  pattern: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  // AWS access keys
  { name: "aws-key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  // GitHub tokens
  { name: "github-token", pattern: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g },
  // Anthropic API keys
  { name: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  // Generic sk- prefixed keys (OpenAI, etc.)
  { name: "sk-key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/g },
  // Bearer tokens
  { name: "bearer", pattern: /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/g },
  // PEM private keys
  { name: "pem-key", pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g },
  // Connection strings with credentials
  { name: "connection-string", pattern: /\b(?:postgres|mysql|mongodb|redis|amqp)(?:ql)?:\/\/[^\s'"]+/g },
  // Password fields (key=value or key: value)
  { name: "password-field", pattern: /(?:password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*["']?([^\s"',}{]+)/gi },
  // Generic env-var assignment with long values
  { name: "env-secret", pattern: /(?:_KEY|_SECRET|_TOKEN|_PASSWORD)\s*=\s*["']?([A-Za-z0-9\-._~+\/]{16,})["']?/g },
];

// ── SecretFilter interface ───────────────────────────────────

export interface SecretFilter {
  /** Replace all detected secrets with [REDACTED]. */
  redact(text: string): string;
  /** Return true if the text contains any detected secrets. */
  hasSecrets(text: string): boolean;
}

// ── Factory ──────────────────────────────────────────────────

export function createSecretFilter(): SecretFilter {
  function redact(text: string): string {
    let result = text;
    for (const { pattern } of SECRET_PATTERNS) {
      // Reset lastIndex for global regexps
      pattern.lastIndex = 0;
      result = result.replace(pattern, "[REDACTED]");
    }
    return result;
  }

  function hasSecrets(text: string): boolean {
    for (const { pattern } of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) return true;
    }
    return false;
  }

  return { redact, hasSecrets };
}
