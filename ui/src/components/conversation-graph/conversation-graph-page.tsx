"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getMemoryNodeBySource,
  traverseMemory,
  getMemoryNode,
  getMemoryNodeEdges,
  expandNode,
  type NodeResponse,
  type EdgeResponse,
} from "@/lib/memory-api";
import { GraphCanvas } from "@/components/graph/graph-canvas";
import { GraphToolbar } from "@/components/graph/graph-toolbar";
import { NodeDetailPanel } from "@/components/graph/node-detail-panel";
import { ContextBuilderPanel } from "@/components/graph/context-builder-panel";
import { useGraphLayout } from "@/hooks/use-graph-layout";
import { ConversationNodeList } from "./conversation-node-list";

function getRepo(): string {
  if (typeof window === "undefined") return "default";
  const params = new URLSearchParams(window.location.search);
  return params.get("repo") || "default";
}

function filterBySender(
  nodes: NodeResponse[],
  edges: EdgeResponse[],
  sender: string | null,
): { nodes: NodeResponse[]; edges: EdgeResponse[] } {
  if (!sender) return { nodes, edges };

  function nodeSender(n: NodeResponse): string | null {
    if (n.sender) return n.sender;
    try {
      const meta = JSON.parse(n.meta ?? "{}") as Record<string, unknown>;
      if (typeof meta.sender === "string" && meta.sender) return meta.sender;
    } catch {
      // ignore
    }
    return null;
  }

  const filteredNodes = nodes.filter((n) => nodeSender(n) === sender);
  const nodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter(
    (e) => nodeIds.has(e.from_node) && nodeIds.has(e.to_node),
  );
  return { nodes: filteredNodes, edges: filteredEdges };
}

interface ConversationGraphPageProps {
  conversationId: string;
}

export function ConversationGraphPage({
  conversationId,
}: ConversationGraphPageProps) {
  const [repo, setRepo] = useState("");

  // Root conversation node
  const [rootNodeId, setRootNodeId] = useState<string | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);

  // Raw traversal data
  const [rawNodes, setRawNodes] = useState<NodeResponse[]>([]);
  const [rawEdges, setRawEdges] = useState<EdgeResponse[]>([]);
  const [traverseLoading, setTraverseLoading] = useState(false);

  // Selected node detail
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeResponse | null>(null);
  const [selectedNodeEdges, setSelectedNodeEdges] = useState<EdgeResponse[]>([]);

  // Highlighted context node IDs
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);

  // Right panel tab
  const [rightTab, setRightTab] = useState<"detail" | "context">("detail");

  // Toolbar state
  const [depth, setDepth] = useState(2);
  const [direction, setDirection] = useState<"outgoing" | "incoming" | "both">("both");
  const [edgeKinds, setEdgeKinds] = useState<string[]>([]);
  const [selectedSender, setSelectedSender] = useState<string | null>(null);

  // Left panel sender filter (separate from toolbar sender)
  const [listSenderFilter, setListSenderFilter] = useState<string | null>(null);

  // Derive all edge kinds from current raw edges
  const allEdgeKinds = Array.from(new Set(rawEdges.map((e) => e.kind))).sort();

  // Derive senders from current raw nodes
  const senders = Array.from(
    new Set(
      rawNodes.flatMap((n) => {
        const candidates: string[] = [];
        if (n.sender) candidates.push(n.sender);
        try {
          const meta = JSON.parse(n.meta ?? "{}") as Record<string, unknown>;
          if (typeof meta.sender === "string" && meta.sender) {
            candidates.push(meta.sender);
          }
        } catch {
          // ignore
        }
        return candidates;
      }),
    ),
  ).sort();

  // Apply sender filter for display
  const { nodes: displayNodes, edges: displayEdges } = filterBySender(
    rawNodes,
    rawEdges,
    selectedSender,
  );

  // Apply edge kind filter
  const filteredEdges =
    edgeKinds.length > 0
      ? displayEdges.filter((e) => edgeKinds.includes(e.kind))
      : displayEdges;

  // Graph layout
  const { nodes: layoutNodes, edges: layoutEdges } = useGraphLayout(
    displayNodes,
    filteredEdges,
  );

  // Apply list-panel sender filter to node list only
  const listNodes =
    listSenderFilter !== null
      ? filterBySender(rawNodes, rawEdges, listSenderFilter).nodes
      : rawNodes;

  // Load repo from URL on mount
  useEffect(() => {
    setRepo(getRepo());
  }, []);

  // Traverse from a node ID
  const doTraverse = useCallback(
    async (nodeId: string, overrides?: { depth?: number; direction?: string }) => {
      setTraverseLoading(true);
      try {
        const result = await traverseMemory(nodeId, {
          max_depth: overrides?.depth ?? depth,
          direction: overrides?.direction ?? direction,
          max_nodes: 150,
        });
        setRawNodes(result.nodes);
        setRawEdges(result.edges);
        setEdgeKinds([]);
      } catch {
        // Silently ignore traversal errors
      } finally {
        setTraverseLoading(false);
      }
    },
    [depth, direction],
  );

  // Find the conversation node by searching for the conversation ID
  useEffect(() => {
    if (!conversationId) return;

    setRootError(null);
    setRootNodeId(null);
    setRawNodes([]);
    setRawEdges([]);

    // Try to resolve the conversation node:
    // 1. Direct node ID lookup (memory conversations pass the node UUID)
    // 2. Bridge conversation source lookup (bridge conversations pass the conversation string)
    getMemoryNode(conversationId)
      .then((node) => {
        setRootNodeId(node.id);
        return doTraverse(node.id);
      })
      .catch(() =>
        getMemoryNodeBySource("bridge-conversation", conversationId)
          .then((node) => {
            setRootNodeId(node.id);
            return doTraverse(node.id);
          })
      )
      .catch(() => {
        setRootError(
          "No memory node found for this conversation. The conversation may not have been ingested yet.",
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, repo]);

  // Load node detail when selectedNodeId changes
  useEffect(() => {
    if (!selectedNodeId) {
      setSelectedNode(null);
      setSelectedNodeEdges([]);
      return;
    }
    Promise.all([
      getMemoryNode(selectedNodeId),
      getMemoryNodeEdges(selectedNodeId),
    ])
      .then(([node, edges]) => {
        setSelectedNode(node);
        setSelectedNodeEdges(edges);
      })
      .catch(() => {
        setSelectedNode(null);
        setSelectedNodeEdges([]);
      });
  }, [selectedNodeId]);

  // Toolbar handlers
  const handleDepthChange = useCallback(
    (newDepth: number) => {
      setDepth(newDepth);
      if (rootNodeId) doTraverse(rootNodeId, { depth: newDepth, direction });
    },
    [rootNodeId, doTraverse, direction],
  );

  const handleDirectionChange = useCallback(
    (newDir: "outgoing" | "incoming" | "both") => {
      setDirection(newDir);
      if (rootNodeId) doTraverse(rootNodeId, { depth, direction: newDir });
    },
    [rootNodeId, doTraverse, depth],
  );

  const handleGraphNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handleListSelectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        height: "calc(100vh - 360px)",
        minHeight: 400,
        background: "#0D0D0F",
        overflow: "hidden",
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Left column — node list */}
      <ConversationNodeList
        nodes={listNodes}
        selectedNodeId={selectedNodeId}
        onSelectNode={handleListSelectNode}
        senderFilter={listSenderFilter}
        onSenderFilterChange={setListSenderFilter}
      />

      {/* Center — toolbar + graph canvas */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        <GraphToolbar
          depth={depth}
          onDepthChange={handleDepthChange}
          direction={direction}
          onDirectionChange={handleDirectionChange}
          edgeKinds={edgeKinds}
          allEdgeKinds={allEdgeKinds}
          onEdgeKindsChange={setEdgeKinds}
          senders={senders}
          selectedSender={selectedSender}
          onSenderChange={setSelectedSender}
        />

        {/* Graph canvas area */}
        <div
          style={{
            flex: 1,
            position: "relative",
          }}
          data-highlighted-count={highlightedNodeIds.length}
        >
          {/* Loading overlay */}
          {traverseLoading && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(13,13,15,0.6)",
                zIndex: 10,
              }}
            >
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                Loading graph...
              </div>
            </div>
          )}

          {/* Error state */}
          {rootError && !traverseLoading && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                gap: 8,
                padding: 24,
                textAlign: "center",
              }}
            >
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{
                  width: 40,
                  height: 40,
                  color: "rgba(255,255,255,0.2)",
                }}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.38)" }}>
                {rootError}
              </div>
            </div>
          )}

          {/* Empty state */}
          {layoutNodes.length === 0 && !traverseLoading && !rootError && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                gap: 12,
              }}
            >
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{
                  width: 48,
                  height: 48,
                  color: "rgba(255,255,255,0.12)",
                }}
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>
                No graph data available
              </div>
            </div>
          )}

          <GraphCanvas
            nodes={layoutNodes}
            edges={layoutEdges}
            onNodeClick={handleGraphNodeClick}
          />
        </div>
      </div>

      {/* Right column — tabbed: detail / context */}
      <div
        style={{
          width: 320,
          flexShrink: 0,
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "#1A1A1C",
        }}
      >
        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        >
          {(["detail", "context"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setRightTab(tab)}
              style={{
                flex: 1,
                padding: "10px 0",
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                cursor: "pointer",
                background: "transparent",
                border: "none",
                borderBottom: rightTab === tab
                  ? "2px solid #7C6AF5"
                  : "2px solid transparent",
                color: rightTab === tab
                  ? "rgba(255,255,255,0.87)"
                  : "rgba(255,255,255,0.38)",
                transition: "all 0.15s ease",
              }}
            >
              {tab === "detail" ? "Node Detail" : "Context"}
            </button>
          ))}
        </div>

        {/* Tab content — full height */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {rightTab === "detail" ? (
            <NodeDetailPanel
              node={selectedNode}
              edges={selectedNodeEdges}
              onExpandClick={async (nodeId) => {
                try {
                  await expandNode(nodeId);
                } catch {
                  // expand may fail if file not found — still re-traverse
                }
                if (rootNodeId) doTraverse(rootNodeId);
              }}
            />
          ) : (
            <ContextBuilderPanel
              repo={repo}
              query={selectedNode?.title}
              onHighlightNodes={setHighlightedNodeIds}
            />
          )}
        </div>
      </div>
    </div>
  );
}
