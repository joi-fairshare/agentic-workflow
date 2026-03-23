"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NodeResponse } from "@/lib/memory-api";

const COLOR = "#3B82F6";

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function MessageNode({ data, selected }: NodeProps) {
  const node = data as unknown as NodeResponse;

  let sender = "";
  try {
    const meta = JSON.parse(node.meta ?? "{}") as Record<string, unknown>;
    if (typeof meta.sender === "string") sender = meta.sender;
  } catch {
    // ignore parse errors
  }

  const borderWidth = selected ? 2 : 1;
  const bgOpacity = selected ? 0.3 : 0.15;
  const borderOpacity = selected ? 1 : 0.4;
  const boxShadow = selected
    ? `0 0 12px ${COLOR}66`
    : undefined;

  return (
    <div
      style={{
        background: `rgba(59, 130, 246, ${bgOpacity})`,
        border: `${borderWidth}px solid rgba(59, 130, 246, ${borderOpacity})`,
        borderRadius: 8,
        padding: "8px 10px",
        width: 220,
        boxShadow,
        cursor: "pointer",
        position: "relative",
      }}
      className="message-node"
    >
      <style>{`
        .message-node:hover {
          background: rgba(59, 130, 246, 0.25) !important;
          border-width: 2px !important;
          border-color: rgba(59, 130, 246, 0.7) !important;
          box-shadow: 0 0 8px rgba(59, 130, 246, 0.4) !important;
        }
      `}</style>
      <Handle type="target" position={Position.Top} />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: COLOR,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          message
        </span>
        {sender && (
          <span
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.6)",
              maxWidth: 100,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sender}
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.87)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginBottom: 4,
        }}
      >
        {truncate(node.body || node.title || "", 60)}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.38)",
        }}
      >
        {formatTimestamp(node.created_at)}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
