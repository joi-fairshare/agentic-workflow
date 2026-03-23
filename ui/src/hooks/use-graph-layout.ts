import { useMemo } from "react";
import { Graph } from "@dagrejs/graphlib";
import { layout } from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import type { NodeResponse, EdgeResponse } from "@/lib/memory-api";
import { getEdgeStyle } from "@/components/graph/edge-styles";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 80;

// Edge kinds that may form cycles — removed before layout and re-added after
const CYCLE_EDGE_KINDS = new Set(["related_to", "references"]);

export interface GraphLayoutResult {
  nodes: Node[];
  edges: Edge[];
}

export function useGraphLayout(
  rawNodes: NodeResponse[],
  rawEdges: EdgeResponse[],
): GraphLayoutResult {
  return useMemo(() => {
    if (rawNodes.length === 0) {
      return { nodes: [], edges: [] };
    }

    // Split edges — acyclic edges go into dagre, cycle-prone ones skip layout
    const layoutEdges = rawEdges.filter((e) => !CYCLE_EDGE_KINDS.has(e.kind));

    // Build dagre graph
    const g = new Graph({ multigraph: true });
    g.setGraph({
      rankdir: "TB",
      nodesep: 60,
      ranksep: 80,
      marginx: 20,
      marginy: 20,
    });
    g.setDefaultEdgeLabel(() => ({}));

    for (const node of rawNodes) {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }

    for (const edge of layoutEdges) {
      // dagre requires unique edge keys when there are parallel edges
      g.setEdge(edge.from_node, edge.to_node, {}, edge.id);
    }

    layout(g);

    // Map dagre output to React Flow nodes
    const rfNodes: Node[] = rawNodes.map((node) => {
      const dagreNode = g.node(node.id) as
        | { x: number; y: number }
        | undefined;
      const x = dagreNode ? dagreNode.x - NODE_WIDTH / 2 : 0;
      const y = dagreNode ? dagreNode.y - NODE_HEIGHT / 2 : 0;

      return {
        id: node.id,
        type: node.kind,
        position: { x, y },
        data: { ...node } as Record<string, unknown>,
      };
    });

    // Map all edges (layout + deferred) to React Flow edges
    const rfEdges: Edge[] = rawEdges.map((edge) => {
      const style = getEdgeStyle(edge.kind);
      return {
        id: edge.id,
        source: edge.from_node,
        target: edge.to_node,
        animated: style.animated,
        data: { kind: edge.kind } as Record<string, unknown>,
        style: {
          stroke: style.stroke,
          strokeDasharray: style.strokeDasharray,
        },
        // Label deferred edges so they can be distinguished in legend
        label: CYCLE_EDGE_KINDS.has(edge.kind) ? edge.kind : undefined,
      };
    });

    return { nodes: rfNodes, edges: rfEdges };
  }, [rawNodes, rawEdges]);
}
