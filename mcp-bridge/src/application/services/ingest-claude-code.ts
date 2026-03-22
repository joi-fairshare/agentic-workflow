// mcp-bridge/src/application/services/ingest-claude-code.ts
import type { MemoryDbClient } from "../../db/memory-client.js";
import type { SecretFilter } from "../../ingestion/secret-filter.js";
import type { AppResult } from "../result.js";
import { ok, err } from "../result.js";
import { parseClaudeCodeSession } from "../../ingestion/claude-code-parser.js";

// ── Input / output types ─────────────────────────────────────

export interface ClaudeCodeSessionInput {
  repo: string;
  sessionId: string;
  filePath: string;
  lines: string[];
}

export interface IngestResult {
  messages_ingested: number;
  edges_created: number;
  skipped: number;
  conversation_id: string;
}

export interface ExpandResult {
  nodes_created: number;
  edges_created: number;
  already_expanded: boolean;
}

// ── ingestClaudeCodeSummary ──────────────────────────────────

/**
 * Parse a Claude Code JSONL session and create summary-level memory nodes:
 * one conversation node + one human + one assistant node per turn.
 *
 * Idempotent: if a node already exists for this sessionId, returns a skipped result.
 * Stores `expanded: false` and the assistant UUIDs in each assistant turn's metadata
 * so that `expandClaudeCodeTurn` can later hydrate tool-use detail.
 */
export function ingestClaudeCodeSummary(
  mdb: MemoryDbClient,
  filter: SecretFilter,
  input: ClaudeCodeSessionInput,
): AppResult<IngestResult> {
  const { repo, sessionId, filePath, lines } = input;

  // Idempotency: skip if session already ingested
  const existing = mdb.getNodeBySource("claude-code-session", sessionId);
  if (existing) {
    return ok({
      messages_ingested: 0,
      edges_created: 0,
      skipped: 1,
      conversation_id: existing.id,
    });
  }

  const parsed = parseClaudeCodeSession(lines);

  const result = mdb.transaction(() => {
    // Create the conversation node
    const convNode = mdb.insertNode({
      repo,
      kind: "conversation",
      title: filter.redact(`Claude Code session: ${sessionId}`),
      body: "",
      meta: JSON.stringify({
        session_id: sessionId,
        file_path: filePath,
        cwd: parsed.metadata.cwd,
        git_branch: parsed.metadata.gitBranch,
        version: parsed.metadata.version,
        entrypoint: parsed.metadata.entrypoint,
      }),
      source_id: sessionId,
      source_type: "claude-code-session",
    });

    let messagesIngested = 0;
    let edgesCreated = 0;

    // Track the previous assistant node id for chaining human → prev-assistant reply_to
    let prevAssistantNodeId: string | null = null;

    for (const turn of parsed.turns) {
      const humanSourceId = `${sessionId}:human:${turn.index}`;
      const assistantSourceId = `${sessionId}:assistant:${turn.index}`;

      const humanContent = filter.redact(turn.human.content);

      // Human message node
      const humanNode = mdb.insertNode({
        repo,
        kind: "message",
        title: humanContent.slice(0, 120) || "[human]",
        body: humanContent,
        meta: JSON.stringify({
          sender: "human",
          uuid: turn.human.uuid,
          timestamp: turn.human.timestamp,
          turn_index: turn.index,
        }),
        source_id: humanSourceId,
        source_type: "claude-code-message",
        sender: "human",
      });

      // contains: conversation → human message
      mdb.insertEdge({
        repo,
        from_node: convNode.id,
        to_node: humanNode.id,
        kind: "contains",
        weight: 1.0,
        meta: "{}",
        auto: true,
      });
      edgesCreated++;

      // reply_to: human (turn N) → assistant (turn N-1)
      if (prevAssistantNodeId !== null) {
        mdb.insertEdge({
          repo,
          from_node: humanNode.id,
          to_node: prevAssistantNodeId,
          kind: "reply_to",
          weight: 1.0,
          meta: "{}",
          auto: true,
        });
        edgesCreated++;
      }

      messagesIngested++;

      const assistantVisibleText = filter.redact(turn.assistant.visibleText);

      // Assistant message node — stores UUIDs and expanded flag for detail expansion
      const assistantNode = mdb.insertNode({
        repo,
        kind: "message",
        title: assistantVisibleText.slice(0, 120) || "[assistant]",
        body: assistantVisibleText,
        meta: JSON.stringify({
          sender: "assistant",
          uuids: turn.assistant.uuids,
          timestamp: turn.assistant.timestamp,
          turn_index: turn.index,
          has_thinking: turn.assistant.hasThinking,
          tool_use_count: turn.assistant.toolUses.length,
          expanded: false,
        }),
        source_id: assistantSourceId,
        source_type: "claude-code-message",
        sender: "assistant",
      });

      // contains: conversation → assistant message
      mdb.insertEdge({
        repo,
        from_node: convNode.id,
        to_node: assistantNode.id,
        kind: "contains",
        weight: 1.0,
        meta: "{}",
        auto: true,
      });
      edgesCreated++;

      // reply_to: assistant → human (same turn)
      mdb.insertEdge({
        repo,
        from_node: assistantNode.id,
        to_node: humanNode.id,
        kind: "reply_to",
        weight: 1.0,
        meta: "{}",
        auto: true,
      });
      edgesCreated++;

      messagesIngested++;
      prevAssistantNodeId = assistantNode.id;
    }

    return {
      messages_ingested: messagesIngested,
      edges_created: edgesCreated,
      skipped: 0,
      conversation_id: convNode.id,
    };
  });

  return ok(result);
}

// ── expandClaudeCodeTurn ─────────────────────────────────────

/**
 * Hydrate tool-use detail for a single assistant turn node.
 *
 * Reads the turn node's metadata to find stored UUIDs, re-parses the JSONL
 * to find the matching turn, then creates artifact/task child nodes for each
 * tool_use and marks the turn as `expanded: true`.
 *
 * Idempotent: returns `{ already_expanded: true }` if the node is already expanded.
 */
export function expandClaudeCodeTurn(
  mdb: MemoryDbClient,
  filter: SecretFilter,
  turnNodeId: string,
  lines: string[],
): AppResult<ExpandResult> {
  // 1. Read the turn node
  const turnNode = mdb.getNode(turnNodeId);
  if (!turnNode) {
    return err({ code: "NOT_FOUND", message: `Turn node not found: ${turnNodeId}`, statusHint: 404 });
  }

  // 2. Parse metadata and check expanded flag
  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(turnNode.meta) as Record<string, unknown>;
  } catch {
    return err({ code: "INTERNAL_ERROR", message: "Failed to parse turn node metadata", statusHint: 500 });
  }

  if (meta.expanded === true) {
    return ok({ nodes_created: 0, edges_created: 0, already_expanded: true });
  }

  // 3. Get the stored UUIDs
  const storedUuids = Array.isArray(meta.uuids) ? (meta.uuids as string[]) : [];
  const storedUuidSet = new Set(storedUuids);

  // 4. Re-parse JSONL to find the matching turn
  const parsed = parseClaudeCodeSession(lines);
  const matchingTurn = parsed.turns.find((t) =>
    t.assistant.uuids.some((u) => storedUuidSet.has(u))
  );

  if (!matchingTurn) {
    // No matching turn found — mark expanded to avoid retry loops, return 0 nodes
    const updatedMeta = { ...meta, expanded: true };
    mdb.updateNodeMeta(turnNodeId, JSON.stringify(updatedMeta));
    return ok({ nodes_created: 0, edges_created: 0, already_expanded: false });
  }

  const repo = turnNode.repo;

  const result = mdb.transaction(() => {
    let nodesCreated = 0;
    let edgesCreated = 0;

    for (const toolUse of matchingTurn.assistant.toolUses) {
      const inputStr = filter.redact(JSON.stringify(toolUse.input));

      if (toolUse.isSubagent) {
        // Subagent Agent tool → task node
        const taskNode = mdb.insertNode({
          repo,
          kind: "task",
          title: filter.redact(toolUse.subagentDescription ?? toolUse.name).slice(0, 120),
          body: inputStr,
          meta: JSON.stringify({
            tool_use_id: toolUse.toolUseId,
            tool_name: toolUse.name,
            subagent_type: toolUse.subagentType,
            subagent_description: toolUse.subagentDescription,
          }),
          source_id: toolUse.toolUseId,
          source_type: "claude-code-tool-use",
        });

        mdb.insertEdge({
          repo,
          from_node: turnNodeId,
          to_node: taskNode.id,
          kind: "contains",
          weight: 1.0,
          meta: "{}",
          auto: true,
        });
        nodesCreated++;
        edgesCreated++;
      } else {
        // Regular tool_use → artifact node
        const artifactNode = mdb.insertNode({
          repo,
          kind: "artifact",
          title: filter.redact(toolUse.name).slice(0, 120),
          body: inputStr,
          meta: JSON.stringify({
            tool_use_id: toolUse.toolUseId,
            tool_name: toolUse.name,
          }),
          source_id: toolUse.toolUseId,
          source_type: "claude-code-tool-use",
        });

        mdb.insertEdge({
          repo,
          from_node: turnNodeId,
          to_node: artifactNode.id,
          kind: "contains",
          weight: 1.0,
          meta: "{}",
          auto: true,
        });
        nodesCreated++;
        edgesCreated++;
      }
    }

    // 8. Update the turn node metadata: expanded: true
    const updatedMeta = { ...meta, expanded: true };
    mdb.updateNodeMeta(turnNodeId, JSON.stringify(updatedMeta));

    return { nodes_created: nodesCreated, edges_created: edgesCreated, already_expanded: false };
  });

  return ok(result);
}
