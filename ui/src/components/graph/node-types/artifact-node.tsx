"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NodeResponse } from "@/lib/memory-api";

const COLOR = "#8B5CF6";

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

export function ArtifactNode({ data, selected }: NodeProps) {
  const node = data as unknown as NodeResponse;

  let artifactType = "";
  try {
    const meta = JSON.parse(node.meta ?? "{}") as Record<string, unknown>;
    if (typeof meta.type === "string") artifactType = meta.type;
    else if (typeof meta.artifact_type === "string")
      artifactType = meta.artifact_type;
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
        background: `rgba(139, 92, 246, ${bgOpacity})`,
        border: `${borderWidth}px solid rgba(139, 92, 246, ${borderOpacity})`,
        borderRadius: 8,
        padding: "8px 10px",
        width: 220,
        boxShadow,
        cursor: "pointer",
        position: "relative",
      }}
      className="artifact-node"
    >
      <style>{`
        .artifact-node:hover {
          background: rgba(139, 92, 246, 0.25) !important;
          border-width: 2px !important;
          border-color: rgba(139, 92, 246, 0.7) !important;
          box-shadow: 0 0 8px rgba(139, 92, 246, 0.4) !important;
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
          artifact
        </span>
        {artifactType && (
          <span
            style={{
              fontSize: 9,
              color: "rgba(255,255,255,0.6)",
              background: "rgba(139, 92, 246, 0.15)",
              border: "1px solid rgba(139, 92, 246, 0.35)",
              borderRadius: 4,
              padding: "1px 5px",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {truncate(artifactType, 12)}
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
