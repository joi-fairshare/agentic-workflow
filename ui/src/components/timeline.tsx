"use client";

import { useState } from "react";
import type { Message, Task } from "@/lib/types";

type TimelineItem =
  | { type: "message"; data: Message; timestamp: string }
  | { type: "task"; data: Task; timestamp: string };

interface TimelineProps {
  messages: Message[];
  tasks: Task[];
}

const KIND_COLORS: Record<string, string> = {
  context: "bg-blue-600",
  task: "bg-purple-600",
  status: "bg-yellow-600",
  reply: "bg-green-600",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-500",
  in_progress: "bg-blue-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`${color} text-white text-xs px-2 py-0.5 rounded-full`}>
      {label}
    </span>
  );
}

function MessageItem({ msg }: { msg: Message }) {
  const [expanded, setExpanded] = useState(false);
  const truncated = msg.payload.length > 120;
  const display = expanded || !truncated ? msg.payload : msg.payload.slice(0, 120) + "...";

  return (
    <div className="border border-zinc-700 rounded-lg p-3 bg-zinc-900">
      <div className="flex items-center gap-2 mb-1 text-sm">
        <Badge label={msg.kind} color={KIND_COLORS[msg.kind] ?? "bg-gray-600"} />
        <span className="text-zinc-300">
          {msg.sender} <span className="text-zinc-500">&rarr;</span> {msg.recipient}
        </span>
        <span className="text-zinc-500 text-xs ml-auto">
          {new Date(msg.created_at).toLocaleTimeString()}
        </span>
      </div>
      <pre className="text-zinc-400 text-sm whitespace-pre-wrap break-words font-mono">
        {display}
      </pre>
      {truncated && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-blue-400 text-xs mt-1 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function TaskItem({ task }: { task: Task }) {
  return (
    <div className="border border-zinc-700 rounded-lg p-3 bg-zinc-950">
      <div className="flex items-center gap-2 mb-1 text-sm">
        <Badge label={task.status} color={STATUS_COLORS[task.status] ?? "bg-gray-600"} />
        <span className="text-zinc-300 font-medium">{task.domain}</span>
        {task.assigned_to && (
          <span className="text-zinc-500 text-xs">&rarr; {task.assigned_to}</span>
        )}
        <span className="text-zinc-500 text-xs ml-auto">
          {new Date(task.created_at).toLocaleTimeString()}
        </span>
      </div>
      <p className="text-zinc-300 text-sm">{task.summary}</p>
    </div>
  );
}

export function Timeline({ messages, tasks }: TimelineProps) {
  const items: TimelineItem[] = [
    ...messages.map((m) => ({ type: "message" as const, data: m, timestamp: m.created_at })),
    ...tasks.map((t) => ({ type: "task" as const, data: t, timestamp: t.created_at })),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (items.length === 0) {
    return <p className="text-zinc-500 text-sm">No messages or tasks yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) =>
        item.type === "message" ? (
          <MessageItem key={item.data.id} msg={item.data} />
        ) : (
          <TaskItem key={item.data.id} task={item.data} />
        ),
      )}
    </div>
  );
}
