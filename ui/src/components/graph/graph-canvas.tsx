"use client";
import { useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const NODE_KIND_COLORS: Record<string, string> = {
  message: "#3B82F6",
  conversation: "#7C6AF5",
  topic: "#10B981",
  decision: "#F59E0B",
  task: "#EF4444",
  artifact: "#8B5CF6",
};

const DEFAULT_NODE_COLOR = "#71717A";

// nodeTypes is intentionally empty here; custom node components will be
// registered in Task 14. Defined outside the component to maintain a stable
// reference and avoid React Flow re-registrations on every render.
const nodeTypes = {};

interface GraphCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodeClick?: (nodeId: string) => void;
}

export function GraphCanvas({ nodes, edges, onNodeClick }: GraphCanvasProps) {
  const [rfNodes, setNodes, onNodesChange] = useNodesState(nodes);
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState(edges);

  // Sync incoming layout changes into React Flow state
  useEffect(() => {
    setNodes(nodes);
  }, [nodes, setNodes]);

  useEffect(() => {
    setEdges(edges);
  }, [edges, setEdges]);

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      onNodeClick?.(node.id);
    },
    [onNodeClick],
  );

  const getMiniMapNodeColor = useCallback((node: Node): string => {
    const kind =
      typeof node.data?.kind === "string" ? node.data.kind : node.type ?? "";
    return NODE_KIND_COLORS[kind] ?? DEFAULT_NODE_COLOR;
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", background: "#0D0D0F" }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        colorMode="dark"
      >
        <Background color="rgba(255,255,255,0.04)" gap={24} />
        <Controls />
        <MiniMap
          nodeColor={getMiniMapNodeColor}
          bgColor="#1A1A1C"
          maskColor="rgba(13,13,15,0.6)"
        />
      </ReactFlow>
    </div>
  );
}
