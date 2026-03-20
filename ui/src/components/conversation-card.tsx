import Link from "next/link";
import type { ConversationSummary } from "@/lib/types";

interface ConversationCardProps {
  conversation: ConversationSummary;
}

export function ConversationCard({ conversation: conv }: ConversationCardProps) {
  const time = new Date(conv.last_activity);
  const relative = formatRelativeTime(time);

  return (
    <Link
      href={`/conversation/${conv.conversation}`}
      className="group flex items-center gap-[var(--s5)] p-[var(--s5)] bg-surface border border-border rounded-md no-underline text-text-primary transition-all duration-150 hover:bg-surface-raised hover:border-[rgba(255,255,255,0.12)] hover:shadow-[0_0_20px_var(--color-accent-glow)]"
    >
      {/* Icon */}
      <div className="w-11 h-11 bg-accent-dim border border-accent-border rounded-sm flex items-center justify-center shrink-0">
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-accent">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[var(--s2)]">
          <span className="font-mono text-sm font-medium text-text-primary truncate">
            {conv.conversation.slice(0, 8)}...{conv.conversation.slice(-4)}
          </span>
        </div>
        <div className="text-xs text-text-secondary mt-0.5 truncate sm:hidden">
          {conv.message_count} messages &middot; {conv.task_count} tasks
        </div>
      </div>

      {/* Stats */}
      <div className="hidden sm:flex items-center gap-[var(--s4)] text-center shrink-0">
        <div>
          <div className="text-lg font-bold text-text-primary">{conv.message_count}</div>
          <div className="text-[11px] text-text-tertiary">Msgs</div>
        </div>
        <div className="w-px h-6 bg-border" />
        <div>
          <div className="text-lg font-bold text-text-primary">{conv.task_count}</div>
          <div className="text-[11px] text-text-tertiary">Tasks</div>
        </div>
      </div>

      {/* Timestamp */}
      <div className="text-xs text-text-tertiary shrink-0 w-16 text-right">
        {relative}
      </div>

      {/* Chevron */}
      <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-text-tertiary shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-text-secondary">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </Link>
  );
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
