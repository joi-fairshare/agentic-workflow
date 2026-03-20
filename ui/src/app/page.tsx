"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchConversations } from "@/lib/api";
import { useSse } from "@/hooks/use-sse";
import { ConversationCard } from "@/components/conversation-card";
import type { ConversationSummary } from "@/lib/types";

const PAGE_SIZE = 20;

export default function ConversationListPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (newOffset: number) => {
    setLoading(true);
    try {
      const data = await fetchConversations(PAGE_SIZE, newOffset);
      setConversations(newOffset === 0 ? data.conversations : (prev) => [...prev, ...data.conversations]);
      setTotal(data.total);
      setOffset(newOffset);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(0); }, [load]);
  useSse({ onEvent: () => { load(0); } });

  const filtered = filter
    ? conversations.filter((c) => c.conversation.toLowerCase().includes(filter.toLowerCase()))
    : conversations;

  return (
    <div className="max-w-[960px] mx-auto px-[var(--s3)] py-[var(--s8)]">
      {/* Page header */}
      <div className="flex items-center gap-[var(--s3)] mb-[var(--s6)]">
        <h1 className="text-xl font-bold">Conversations</h1>
        <span className="text-xs font-semibold text-accent bg-accent-dim border border-accent-border px-[var(--s2)] py-0.5 rounded-full">
          {total}
        </span>
      </div>

      {/* Search */}
      <div className="relative mb-[var(--s5)]">
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-[var(--s3)] top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          aria-label="Search conversations"
          placeholder="Search conversations..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full pl-10 pr-[var(--s4)] py-[var(--s3)] bg-surface border border-border rounded-sm text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-border focus:shadow-[0_0_0_2px_var(--color-accent-dim)]"
        />
      </div>

      {/* Card list */}
      <div className="flex flex-col gap-[var(--s3)]">
        {filtered.map((conv) => (
          <ConversationCard key={conv.conversation} conversation={conv} />
        ))}
        {filtered.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-[var(--s12)] text-center">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 text-text-tertiary mb-[var(--s4)]">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <div className="text-sm font-medium text-text-secondary">
              {filter ? "No matching conversations" : "No conversations yet"}
            </div>
            <div className="text-xs text-text-tertiary mt-[var(--s1)]">
              {filter ? "Try a different search term" : "Conversations will appear here as agents communicate"}
            </div>
          </div>
        )}
      </div>

      {/* Load more */}
      {conversations.length < total && (
        <div className="flex justify-center mt-[var(--s6)]">
          <button
            onClick={() => load(offset + PAGE_SIZE)}
            disabled={loading}
            className="px-[var(--s6)] py-[var(--s3)] bg-surface border border-border rounded-sm text-sm font-medium text-text-secondary hover:text-text-primary hover:border-[rgba(255,255,255,0.12)] transition-all disabled:opacity-50"
          >
            {loading ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
