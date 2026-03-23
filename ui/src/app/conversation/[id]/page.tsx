"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { fetchMessages, fetchTasks } from "@/lib/api";
import {
  getMemoryNode,
  getMemoryNodeBySource,
  traverseMemory,
  type NodeResponse,
} from "@/lib/memory-api";
import { useSse } from "@/hooks/use-sse";
import { buildDirectedGraph, buildSequenceDiagram } from "@/lib/diagrams";
import { VerticalTimeline } from "@/components/vertical-timeline";
import { DiagramPanel } from "@/components/diagram-panel";
import type { Message, Task, BridgeEventType } from "@/lib/types";

function nodeToMessage(node: NodeResponse, conversation: string): Message {
  let kind: Message["kind"] = "reply";
  try {
    const meta = JSON.parse(node.meta ?? "{}") as Record<string, unknown>;
    if (typeof meta.kind === "string" && ["context", "task", "status", "reply"].includes(meta.kind)) {
      kind = meta.kind as Message["kind"];
    }
  } catch { /* ignore */ }

  const sender = node.sender || "unknown";
  const recipient = sender === "human" || sender === "user"
    ? "assistant"
    : sender === "assistant"
      ? "human"
      : "system";

  return {
    id: node.id,
    conversation,
    sender,
    recipient,
    kind,
    payload: node.body || node.title,
    meta_prompt: null,
    created_at: node.created_at,
    read_at: null,
  };
}

export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const conversationId = params.id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [msgs, tsks] = await Promise.all([
        fetchMessages(conversationId),
        fetchTasks(conversationId),
      ]);
      setMessages(msgs);
      setTasks(tsks);

      // If bridge returned nothing, fall back to memory graph
      if (msgs.length === 0) {
        try {
          // Resolve conversation node: try direct UUID, then bridge source lookup
          let rootId: string | null = null;
          try {
            const node = await getMemoryNode(conversationId);
            rootId = node.id;
          } catch {
            const node = await getMemoryNodeBySource("bridge-conversation", conversationId);
            rootId = node.id;
          }
          if (rootId) {
            const result = await traverseMemory(rootId, {
              max_depth: 1,
              direction: "outgoing",
              max_nodes: 200,
            });
            const memMsgs = result.nodes
              .filter((n) => n.kind === "message")
              .sort((a, b) => a.created_at.localeCompare(b.created_at))
              .map((n) => nodeToMessage(n, conversationId));
            if (memMsgs.length > 0) {
              setMessages(memMsgs);
            }
          }
        } catch {
          // Memory also unavailable — leave empty
        }
      }
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  useSse({
    onEvent: (_type: BridgeEventType, data: Record<string, string>) => {
      if (data.conversation === conversationId) load();
    },
  });

  const graphDef = useMemo(() => buildDirectedGraph(messages), [messages]);
  const seqDef = useMemo(() => buildSequenceDiagram(messages), [messages]);

  if (loading && messages.length === 0) {
    return <p className="text-text-secondary">Loading...</p>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_520px] gap-[var(--s6)] items-start">
      {/* Timeline */}
      <div>
        <div className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-[var(--s4)]">
          Timeline
        </div>
        <div className="timeline-scroll max-h-[calc(100vh-200px)] overflow-y-auto pr-[var(--s2)]">
          <VerticalTimeline messages={messages} tasks={tasks} />
        </div>
      </div>

      {/* Diagrams sidebar */}
      <div className="flex flex-col gap-[var(--s6)] sticky top-20">
        <DiagramPanel title="Agent Graph" definition={graphDef} />
        <DiagramPanel title="Sequence Diagram" definition={seqDef} />
      </div>
    </div>
  );
}
