"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NodeResponse } from "@/lib/memory-api";

const COLOR = "#10B981";

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

export function TopicNode({ data, selected }: NodeProps) {
  const node = data as unknown as NodeResponse;

  const borderWidth = selected ? 2 : 1;
  const bgOpacity = selected ? 0.3 : 0.15;
  const borderOpacity = selected ? 1 : 0.4;
  const boxShadow = selected ? `0 0 12px ${COLOR}66` : undefined;

  return (
    <div
      style={{
        background: `rgba(16, 185, 129, ${bgOpacity})`,
        border: `${borderWidth}px solid rgba(16, 185, 129, ${borderOpacity})`,
        borderRadius: 8,
        padding: "8px 10px",
        width: 220,
        boxShadow,
        cursor: "pointer",
        position: "relative",
      }}
      className="topic-node"
    >
      <style>{`
        .topic-node:hover {
          background: rgba(16, 185, 129, 0.25) !important;
          border-width: 2px !important;
          border-color: rgba(16, 185, 129, 0.7) !important;
          box-shadow: 0 0 8px rgba(16, 185, 129, 0.4) !important;
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
          marginBottom: 4,
        }}
      >
        topic
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "rgba(255,255,255,0.87)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {truncate(node.title || "", 45)}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
