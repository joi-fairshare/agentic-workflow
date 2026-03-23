"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchConversations } from "@/lib/api";
import { fetchMemoryConversations, getRepos, type MemoryConversation } from "@/lib/memory-api";
import { useSse } from "@/hooks/use-sse";
import { ConversationCard } from "@/components/conversation-card";
import type { ConversationSummary } from "@/lib/types";

const PAGE_SIZE = 20;

/** Adapt a MemoryConversation into the ConversationSummary shape the card expects. */
function toSummary(mc: MemoryConversation): ConversationSummary {
  return {
    conversation: mc.id,
    message_count: mc.message_count,
    task_count: 0,
    last_activity: mc.created_at,
  };
}

export default function ConversationListPage() {
  // Bridge conversations
  const [bridgeConvs, setBridgeConvs] = useState<ConversationSummary[]>([]);
  const [bridgeTotal, setBridgeTotal] = useState(0);

  // Memory conversations
  const [memoryConvs, setMemoryConvs] = useState<MemoryConversation[]>([]);
  const [memoryTotal, setMemoryTotal] = useState(0);
  const [memoryOffset, setMemoryOffset] = useState(0);

  // Repo selection — store repos with their conversation counts
  const [repoCounts, setRepoCounts] = useState<{ name: string; count: number }[]>([]);
  const [repo, setRepo] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);

  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  // Load repos on mount with conversation counts
  useEffect(() => {
    getRepos()
      .then(async (list) => {
        if (list.length === 0) return;
        const counts: { name: string; count: number }[] = [];
        for (const r of list) {
          try {
            const data = await fetchMemoryConversations(r, 1, 0);
            counts.push({ name: r, count: data.total });
          } catch {
            counts.push({ name: r, count: 0 });
          }
        }
        // Sort by conversation count descending
        counts.sort((a, b) => b.count - a.count);
        setRepoCounts(counts);

        const best = counts[0];
        setRepo(best.name);
        setRepoInput(best.name);
      })
      .catch(() => {});
  }, []);

  // Load bridge conversations
  const loadBridge = useCallback(async () => {
    try {
      const data = await fetchConversations(PAGE_SIZE, 0);
      setBridgeConvs(data.conversations);
      setBridgeTotal(data.total);
    } catch {
      // Bridge may be empty — that's fine
    }
  }, []);

  // Load memory conversations when repo changes
  const loadMemory = useCallback(
    async (newOffset: number) => {
      if (!repo) return;
      setLoading(true);
      try {
        const data = await fetchMemoryConversations(repo, PAGE_SIZE, newOffset);
        setMemoryConvs(
          newOffset === 0
            ? data.conversations
            : (prev) => [...prev, ...data.conversations],
        );
        setMemoryTotal(data.total);
        setMemoryOffset(newOffset);
      } finally {
        setLoading(false);
      }
    },
    [repo],
  );

  useEffect(() => {
    loadBridge();
  }, [loadBridge]);

  useEffect(() => {
    if (repo) loadMemory(0);
  }, [repo, loadMemory]);

  useSse({ onEvent: (type) => {
    if (type === "memory:session_ingested") {
      loadMemory(0);
    } else {
      loadBridge();
    }
  } });

  // Merge bridge + memory conversations into a unified list
  const allConversations: ConversationSummary[] = [
    ...bridgeConvs,
    ...memoryConvs.map(toSummary),
  ];
  const total = bridgeTotal + memoryTotal;

  const filtered = filter
    ? allConversations.filter(
        (c) =>
          c.conversation.toLowerCase().includes(filter.toLowerCase()),
      )
    : allConversations;

  // Find titles for memory conversations (for search)
  const memoryTitleMap = new Map(memoryConvs.map((mc) => [mc.id, mc.title]));

  const filteredWithTitle = filter
    ? allConversations.filter((c) => {
        const title = memoryTitleMap.get(c.conversation) ?? c.conversation;
        return title.toLowerCase().includes(filter.toLowerCase());
      })
    : allConversations;

  return (
    <div className="max-w-[960px] mx-auto px-[var(--s3)] py-[var(--s8)]">
      {/* Page header */}
      <div className="flex items-center gap-[var(--s3)] mb-[var(--s6)]">
        <h1 className="text-xl font-bold">Conversations</h1>
        <span className="text-xs font-semibold text-accent bg-accent-dim border border-accent-border px-[var(--s2)] py-0.5 rounded-full">
          {total}
        </span>

        {/* Repo typeahead */}
        <div className="relative ml-auto">
          <input
            type="text"
            value={repoInput}
            onChange={(e) => {
              setRepoInput(e.target.value);
              setRepoDropdownOpen(true);
            }}
            onFocus={() => setRepoDropdownOpen(true)}
            onBlur={() => setTimeout(() => setRepoDropdownOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setRepo(repoInput);
                setRepoDropdownOpen(false);
              }
            }}
            placeholder="repo"
            className="w-[180px] text-xs px-[var(--s2)] py-1 bg-surface border border-border rounded-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-border"
          />
          {repoDropdownOpen && (() => {
            const list = repoCounts
              .filter((rc) =>
                rc.name.toLowerCase().includes(repoInput.toLowerCase()),
              )
              .slice(0, 10);
            if (list.length === 0) return null;
            return (
              <div className="absolute top-full left-0 right-0 mt-0.5 bg-surface border border-border rounded-sm max-h-[200px] overflow-y-auto z-50">
                {list.map((rc) => (
                  <div
                    key={rc.name}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setRepoInput(rc.name);
                      setRepo(rc.name);
                      setRepoDropdownOpen(false);
                    }}
                    className={`px-[var(--s2)] py-1 text-xs cursor-pointer hover:bg-[rgba(255,255,255,0.06)] flex items-center justify-between ${
                      rc.name === repo
                        ? "text-accent bg-accent-dim"
                        : "text-text-secondary"
                    }`}
                  >
                    <span>{rc.name}</span>
                    <span className="text-text-tertiary">{rc.count}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
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
        {filteredWithTitle.map((conv) => (
          <ConversationCard
            key={conv.conversation}
            conversation={conv}
            title={memoryTitleMap.get(conv.conversation)}
          />
        ))}
        {filteredWithTitle.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-[var(--s12)] text-center">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 text-text-tertiary mb-[var(--s4)]">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <div className="text-sm font-medium text-text-secondary">
              {filter ? "No matching conversations" : "No conversations yet"}
            </div>
            <div className="text-xs text-text-tertiary mt-[var(--s1)]">
              {filter ? "Try a different search term" : "Select a repo with ingested sessions"}
            </div>
          </div>
        )}
      </div>

      {/* Load more */}
      {memoryConvs.length < memoryTotal && (
        <div className="flex justify-center mt-[var(--s6)]">
          <button
            onClick={() => loadMemory(memoryOffset + PAGE_SIZE)}
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
