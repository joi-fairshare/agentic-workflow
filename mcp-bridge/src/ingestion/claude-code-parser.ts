// mcp-bridge/src/ingestion/claude-code-parser.ts

// ── Types ────────────────────────────────────────────────────

export interface ToolUseInfo {
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
  isSubagent: boolean;
  subagentType?: string;
  subagentDescription?: string;
}

export interface ClaudeCodeTurn {
  index: number;
  human: { content: string; uuid: string; timestamp: string | null };
  assistant: {
    visibleText: string;
    hasThinking: boolean;
    toolUses: ToolUseInfo[];
    uuids: string[]; // all UUIDs belonging to this turn (for detail expansion)
    timestamp: string | null;
  };
}

export interface SessionMetadata {
  sessionId: string;
  cwd: string;
  gitBranch: string;
  version: string;
  entrypoint: string;
}

export interface ParsedSession {
  metadata: SessionMetadata;
  turns: ClaudeCodeTurn[];
  skipped: number;
}

// ── Internal raw line types ───────────────────────────────────

interface RawLine {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  isMeta?: boolean;
  message?: {
    role?: string;
    content?: unknown;
  };
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  entrypoint?: string;
}

// ── Helpers ──────────────────────────────────────────────────

const SKIP_TYPES = new Set(["file-history-snapshot", "progress", "system"]);

function isToolResultContent(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return content.some(
    (item) =>
      item &&
      typeof item === "object" &&
      (item as Record<string, unknown>).type === "tool_result"
  );
}

function extractUserContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const block = item as Record<string, unknown>;
          if (typeof block.text === "string") return block.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function extractAssistantBlocks(
  blocks: unknown[]
): { visibleText: string; hasThinking: boolean; toolUses: ToolUseInfo[] } {
  const textParts: string[] = [];
  let hasThinking = false;
  const toolUses: ToolUseInfo[] = [];

  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;

    if (b.type === "thinking") {
      hasThinking = true;
    } else if (b.type === "text" && typeof b.text === "string") {
      textParts.push(b.text);
    } else if (b.type === "tool_use") {
      const name = typeof b.name === "string" ? b.name : "";
      const toolUseId = typeof b.id === "string" ? b.id : "";
      const input =
        b.input && typeof b.input === "object"
          ? (b.input as Record<string, unknown>)
          : {};

      const isSubagent = name === "Agent";
      const subagentType =
        isSubagent && typeof input.subagent_type === "string"
          ? input.subagent_type
          : undefined;
      const subagentDescription =
        isSubagent && typeof input.description === "string"
          ? input.description
          : undefined;

      toolUses.push({
        toolUseId,
        name,
        input,
        isSubagent,
        ...(subagentType !== undefined ? { subagentType } : {}),
        ...(subagentDescription !== undefined ? { subagentDescription } : {}),
      });
    }
  }

  return { visibleText: textParts.join("\n"), hasThinking, toolUses };
}

// ── Main parser ───────────────────────────────────────────────

export function parseClaudeCodeSession(lines: string[]): ParsedSession {
  let skipped = 0;
  let metadata: SessionMetadata = {
    sessionId: "",
    cwd: "",
    gitBranch: "",
    version: "",
    entrypoint: "",
  };
  let metadataFound = false;

  // Parse all raw lines
  const parsed: RawLine[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      skipped++;
      continue;
    }

    if (!data || typeof data !== "object") {
      skipped++;
      continue;
    }

    const raw = data as RawLine;

    // Count skipped types
    if (SKIP_TYPES.has(raw.type)) {
      skipped++;
      continue;
    }

    // Extract metadata from first line that has sessionId
    if (!metadataFound && raw.sessionId) {
      metadata = {
        sessionId: raw.sessionId ?? "",
        cwd: raw.cwd ?? "",
        gitBranch: raw.gitBranch ?? "",
        version: raw.version ?? "",
        entrypoint: raw.entrypoint ?? "",
      };
      metadataFound = true;
    }

    parsed.push(raw);
  }

  // Build turns
  const turns: ClaudeCodeTurn[] = [];

  interface InProgressTurn {
    human: { content: string; uuid: string; timestamp: string | null };
    assistantUuids: string[];
    assistantTimestamp: string | null;
    toolUses: ToolUseInfo[];
    textParts: string[];
    hasThinking: boolean;
  }

  let current: InProgressTurn | null = null;

  function finalizeTurn(t: InProgressTurn): ClaudeCodeTurn {
    return {
      index: turns.length,
      human: t.human,
      assistant: {
        visibleText: t.textParts.join("\n"),
        hasThinking: t.hasThinking,
        toolUses: t.toolUses,
        uuids: t.assistantUuids,
        timestamp: t.assistantTimestamp,
      },
    };
  }

  for (const raw of parsed) {
    // Skip meta user messages
    if (raw.type === "user" && raw.isMeta) continue;

    if (raw.type === "user") {
      const content = raw.message?.content;

      // If content is tool_result, it's part of the current turn — not a new turn
      if (isToolResultContent(content)) {
        // Add uuid to current turn if one exists
        if (current && raw.uuid) {
          current.assistantUuids.push(raw.uuid);
        }
        continue;
      }

      // This is a real new human message — finalize previous turn
      if (current) {
        turns.push(finalizeTurn(current));
      }

      current = {
        human: {
          content: extractUserContent(content),
          uuid: raw.uuid ?? "",
          timestamp: raw.timestamp ?? null,
        },
        assistantUuids: [],
        assistantTimestamp: null,
        toolUses: [],
        textParts: [],
        hasThinking: false,
      };
    } else if (raw.type === "assistant" && current) {
      const blocks = Array.isArray(raw.message?.content)
        ? (raw.message!.content as unknown[])
        : [];

      const extracted = extractAssistantBlocks(blocks);

      if (extracted.visibleText) current.textParts.push(extracted.visibleText);
      if (extracted.hasThinking) current.hasThinking = true;
      current.toolUses.push(...extracted.toolUses);

      if (raw.uuid) current.assistantUuids.push(raw.uuid);
      if (!current.assistantTimestamp && raw.timestamp) {
        current.assistantTimestamp = raw.timestamp;
      }
    }
  }

  // Finalize last turn
  if (current) {
    turns.push(finalizeTurn(current));
  }

  return { metadata, turns, skipped };
}
