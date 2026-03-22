"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NodeResponse } from "@/lib/memory-api";

const COLOR = "#7C6AF5";

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

export function ConversationNode({ data, selected }: NodeProps) {
  const node = data as unknown as NodeResponse;

  let messageCount: number | null = null;
  try {
    const meta = JSON.parse(node.meta ?? "{}") as Record<string, unknown>;
    if (typeof meta.message_count === "number") {
      messageCount = meta.message_count;
    } else if (typeof meta.count === "number") {
      messageCount = meta.count;
    }
  } catch {
    // ignore parse errors
  }

  const borderWidth = selected ? 2 : 1;
  const bgOpacity = selected ? 0.3 : 0.15;
  const borderOpacity = selected ? 1 : 0.4;
  const boxShadow = selected ? `0 0 12px ${COLOR}66` : undefined;

  return (
    <div
      style={{
        background: `rgba(124, 106, 245, ${bgOpacity})`,
        border: `${borderWidth}px solid rgba(124, 106, 245, ${borderOpacity})`,
        borderRadius: 10,
        padding: "10px 12px",
        width: 220,
        minHeight: 72,
        boxShadow,
        cursor: "pointer",
        position: "relative",
      }}
      className="conversation-node"
    >
      <style>{`
        .conversation-node:hover {
          background: rgba(124, 106, 245, 0.25) !important;
          border-width: 2px !important;
          border-color: rgba(124, 106, 245, 0.7) !important;
          box-shadow: 0 0 8px rgba(124, 106, 245, 0.4) !important;
        }
      `}</style>
      <Handle type="target" position={Position.Top} />
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: COLOR,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 6,
        }}
      >
        conversation
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "rgba(255,255,255,0.87)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginBottom: 6,
        }}
      >
        {truncate(node.title || "", 40)}
      </div>
      {messageCount !== null && (
        <div
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          {messageCount} message{messageCount !== 1 ? "s" : ""}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
