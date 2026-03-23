"use client";

import { useParams, useSelectedLayoutSegment } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMessages, fetchTasks } from "@/lib/api";
import { getMemoryNode, getMemoryNodeEdges, type NodeResponse, type EdgeResponse } from "@/lib/memory-api";
import { useSse } from "@/hooks/use-sse";
import { CopyButton } from "@/components/copy-button";
import type { Message, Task, BridgeEventType } from "@/lib/types";

function ConversationTabNav({ id }: { id: string }) {
  const segment = useSelectedLayoutSegment();
  const isGraph = segment === "graph";

  const baseClass =
    "px-[var(--s3)] py-[var(--s1)] rounded-sm text-sm font-medium no-underline transition-colors";
  const activeClass = "bg-accent-dim text-accent border border-accent-border";
  const inactiveClass =
    "text-text-secondary hover:text-text-primary hover:bg-surface-raised";

  return (
    <div className="flex gap-1">
      <Link
        href={`/conversation/${id}`}
        className={`${baseClass} ${!isGraph ? activeClass : inactiveClass}`}
      >
        Timeline
      </Link>
      <Link
        href={`/conversation/${id}/graph`}
        className={`${baseClass} ${isGraph ? activeClass : inactiveClass}`}
      >
        Graph
      </Link>
    </div>
  );
}

export default function ConversationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const conversationId = params.id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  // Memory fallback state
  const [memoryNode, setMemoryNode] = useState<NodeResponse | null>(null);
  const [memoryEdges, setMemoryEdges] = useState<EdgeResponse[]>([]);

  const load = useCallback(async () => {
    try {
      const [msgs, tsks] = await Promise.all([
        fetchMessages(conversationId),
        fetchTasks(conversationId),
      ]);
      setMessages(msgs);
      setTasks(tsks);

      // If bridge has no data, fall back to memory graph
      if (msgs.length === 0 && tsks.length === 0) {
        try {
          const [node, edges] = await Promise.all([
            getMemoryNode(conversationId),
            getMemoryNodeEdges(conversationId),
          ]);
          setMemoryNode(node);
          setMemoryEdges(edges);
        } catch {
          // Not in memory either — that's fine
        }
      }
    } catch {
      // Bridge unavailable — try memory directly
      try {
        const [node, edges] = await Promise.all([
          getMemoryNode(conversationId),
          getMemoryNodeEdges(conversationId),
        ]);
        setMemoryNode(node);
        setMemoryEdges(edges);
      } catch {
        // ignore
      }
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

  // Derive display values from bridge or memory data
  const title = memoryNode?.title || conversationId;
  const messageCount = messages.length > 0
    ? messages.length
    : memoryEdges.filter((e) => e.kind === "contains").length;
  const taskCount = tasks.length;
  const agents = useMemo(
    () => {
      if (messages.length > 0) {
        return new Set(messages.flatMap((m) => [m.sender, m.recipient]));
      }
      // For memory conversations, parse sender from meta if available
      if (memoryNode?.sender) {
        return new Set([memoryNode.sender]);
      }
      return new Set<string>();
    },
    [messages, memoryNode],
  );

  return (
    <div className="max-w-[1440px] mx-auto px-[var(--s3)] py-[var(--s8)]">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-[var(--s2)] text-sm text-text-secondary no-underline mb-[var(--s6)] hover:text-text-primary transition-colors"
      >
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
        All conversations
      </Link>

      {/* Conversation header */}
      <div className="flex items-center gap-[var(--s4)] pb-[var(--s6)] mb-[var(--s4)] border-b border-border">
        <div className="w-12 h-12 bg-accent-dim border border-accent-border rounded-md flex items-center justify-center shrink-0 shadow-[0_0_24px_var(--color-accent-glow)]">
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-6 h-6 text-accent"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-bold tracking-tight truncate" title={conversationId}>
            {title}
          </div>
          <div className="flex items-center gap-[var(--s2)] text-sm text-text-secondary mt-0.5">
            <span>{messageCount} messages</span>
            <span className="w-1 h-1 rounded-full bg-text-tertiary" />
            <span>{taskCount} tasks</span>
            {agents.size > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-text-tertiary" />
                <span>{agents.size} agents</span>
              </>
            )}
          </div>
        </div>
        <CopyButton text={conversationId} />
      </div>

      {/* Tab navigation */}
      <div className="mb-[var(--s6)]">
        <ConversationTabNav id={conversationId} />
      </div>

      {children}
    </div>
  );
}
