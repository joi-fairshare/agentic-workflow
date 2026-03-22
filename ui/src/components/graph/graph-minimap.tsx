"use client";
import { MiniMap, type Node } from "@xyflow/react";

export const NODE_KIND_COLORS: Record<string, string> = {
  message: "#3B82F6",
  conversation: "#7C6AF5",
  topic: "#10B981",
  decision: "#F59E0B",
  task: "#EF4444",
  artifact: "#8B5CF6",
};

const DEFAULT_NODE_COLOR = "#71717A";

function getNodeColor(node: Node): string {
  const kind =
    typeof node.data?.kind === "string" ? node.data.kind : node.type ?? "";
  return NODE_KIND_COLORS[kind] ?? DEFAULT_NODE_COLOR;
}

/**
 * GraphMinimap — thin wrapper around React Flow's MiniMap with node-kind
 * coloring. Must be rendered inside a ReactFlow provider context.
 *
 * The kind→color mapping is also exported as NODE_KIND_COLORS for use
 * elsewhere (e.g. legends, tooltips).
 */
export function GraphMinimap() {
  return (
    <MiniMap
      nodeColor={getNodeColor}
      bgColor="#1A1A1C"
      maskColor="rgba(13,13,15,0.6)"
    />
  );
}
