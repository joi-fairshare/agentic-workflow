"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NodeResponse } from "@/lib/memory-api";

const COLOR = "#EF4444";

const STATUS_COLORS: Record<string, string> = {
  done: "#10B981",
  completed: "#10B981",
  in_progress: "#F59E0B",
  pending: "#71717A",
  blocked: "#EF4444",
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

export function TaskNode({ data, selected }: NodeProps) {
  const node = data as unknown as NodeResponse;

  let status = "";
  try {
    const meta = JSON.parse(node.meta ?? "{}") as Record<string, unknown>;
    if (typeof meta.status === "string") status = meta.status;
  } catch {
    // ignore parse errors
  }

  const statusColor = STATUS_COLORS[status] ?? "#71717A";

  const borderWidth = selected ? 2 : 1;
  const bgOpacity = selected ? 0.3 : 0.15;
  const borderOpacity = selected ? 1 : 0.4;
  const boxShadow = selected ? `0 0 12px ${COLOR}66` : undefined;

  return (
    <div
      style={{
        background: `rgba(239, 68, 68, ${bgOpacity})`,
        border: `${borderWidth}px solid rgba(239, 68, 68, ${borderOpacity})`,
        borderRadius: 8,
        padding: "8px 10px",
        width: 220,
        boxShadow,
        cursor: "pointer",
        position: "relative",
      }}
      className="task-node"
    >
      <style>{`
        .task-node:hover {
          background: rgba(239, 68, 68, 0.25) !important;
          border-width: 2px !important;
          border-color: rgba(239, 68, 68, 0.7) !important;
          box-shadow: 0 0 8px rgba(239, 68, 68, 0.4) !important;
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
          task
        </span>
        {status && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: statusColor,
              background: `${statusColor}22`,
              border: `1px solid ${statusColor}66`,
              borderRadius: 4,
              padding: "1px 5px",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {status.replace(/_/g, " ")}
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
        }}
      >
        {truncate(node.title || "", 45)}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
