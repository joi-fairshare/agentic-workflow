"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NodeResponse } from "@/lib/memory-api";

const COLOR = "#F59E0B";

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

export function DecisionNode({ data, selected }: NodeProps) {
  const node = data as unknown as NodeResponse;

  const bgOpacity = selected ? 0.3 : 0.15;
  const borderWidth = selected ? 2 : 1;
  const borderOpacity = selected ? 1 : 0.4;
  const boxShadow = selected ? `0 0 12px ${COLOR}66` : undefined;

  return (
    <div
      style={{
        position: "relative",
        width: 120,
        height: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      className="decision-node-wrapper"
    >
      {/* Diamond outer shape */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: "rotate(45deg)",
          background: `rgba(245, 158, 11, ${bgOpacity})`,
          border: `${borderWidth}px solid rgba(245, 158, 11, ${borderOpacity})`,
          borderRadius: 6,
          boxShadow,
        }}
        className="decision-node-diamond"
      />
      <style>{`
        .decision-node-wrapper:hover .decision-node-diamond {
          background: rgba(245, 158, 11, 0.25) !important;
          border-width: 2px !important;
          border-color: rgba(245, 158, 11, 0.7) !important;
          box-shadow: 0 0 8px rgba(245, 158, 11, 0.4) !important;
        }
      `}</style>
      <Handle type="target" position={Position.Top} />
      {/* Content rotated back */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: 100,
          textAlign: "center",
          gap: 4,
          cursor: "pointer",
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: COLOR,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            lineHeight: 1.2,
          }}
        >
          decision
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: "rgba(255,255,255,0.87)",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            lineHeight: 1.3,
          }}
        >
          {truncate(node.title || "", 30)}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
