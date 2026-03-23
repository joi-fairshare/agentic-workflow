"use client";
import { useCallback, useEffect, useState } from "react";
import {
  getMemoryStats,
  getMemoryNode,
  getMemoryNodeEdges,
  traverseMemory,
  expandNode,
  getRepos,
  type SearchResult,
  type NodeResponse,
  type EdgeResponse,
  type TraversalLog,
  type StatsResponse,
} from "@/lib/memory-api";
import { GraphCanvas } from "@/components/graph/graph-canvas";
import { GraphToolbar } from "@/components/graph/graph-toolbar";
import { NodeDetailPanel } from "@/components/graph/node-detail-panel";
import { ContextBuilderPanel } from "@/components/graph/context-builder-panel";
import { PathReplay } from "@/components/graph/path-replay";
import { useGraphLayout } from "@/hooks/use-graph-layout";
import { usePathReplay } from "@/hooks/use-path-replay";
import { MemorySearchPanel } from "./memory-search-panel";
import { TraversalLogPanel } from "./traversal-log-panel";

function getRepoFromUrl(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("repo") || "";
}

function extractSenders(nodes: NodeResponse[]): string[] {
  const senders = new Set<string>();
  for (const node of nodes) {
    if (node.sender) {
      senders.add(node.sender);
      continue;
    }
    try {
      const meta = JSON.parse(node.meta ?? "{}") as Record<string, unknown>;
      if (typeof meta.sender === "string" && meta.sender) {
        senders.add(meta.sender);
      }
    } catch {
      // ignore
    }
  }
  return Array.from(senders).sort();
}

function filterBySender(
  nodes: NodeResponse[],
  edges: EdgeResponse[],
  sender: string | null,
): { nodes: NodeResponse[]; edges: EdgeResponse[] } {
  if (!sender) return { nodes, edges };
  const filteredNodes = nodes.filter((n) => {
    if (n.sender === sender) return true;
    try {
      const meta = JSON.parse(n.meta ?? "{}") as Record<string, unknown>;
      return meta.sender === sender;
    } catch {
      return false;
    }
  });
  const nodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter(
    (e) => nodeIds.has(e.from_node) && nodeIds.has(e.to_node),
  );
  return { nodes: filteredNodes, edges: filteredEdges };
}

export function MemoryExplorerPage() {
  const [repo, setRepo] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const [repos, setRepos] = useState<string[]>([]);
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const replay = usePathReplay();

  // Selected node state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeResponse | null>(null);
  const [selectedNodeEdges, setSelectedNodeEdges] = useState<EdgeResponse[]>([]);

  // Raw traversal data
  const [rawNodes, setRawNodes] = useState<NodeResponse[]>([]);
  const [rawEdges, setRawEdges] = useState<EdgeResponse[]>([]);
  const [traverseLoading, setTraverseLoading] = useState(false);

  // Highlighted node IDs from context builder
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);

  // Right panel tab
  const [rightTab, setRightTab] = useState<"detail" | "context">("detail");

  // Toolbar state
  const [depth, setDepth] = useState(2);
  const [direction, setDirection] = useState<"outgoing" | "incoming" | "both">("both");
  const [edgeKinds, setEdgeKinds] = useState<string[]>([]);
  const [selectedSender, setSelectedSender] = useState<string | null>(null);

  // Derive all edge kinds from current raw edges
  const allEdgeKinds = Array.from(new Set(rawEdges.map((e) => e.kind))).sort();

  // Derive senders from current raw nodes
  const senders = extractSenders(rawNodes);

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

  // Load repos list and set initial repo from URL or largest available
  useEffect(() => {
    const urlRepo = getRepoFromUrl();
    getRepos()
      .then(async (list) => {
        setRepos(list);
        if (urlRepo && list.includes(urlRepo)) {
          setRepo(urlRepo);
          setRepoInput(urlRepo);
          return;
        }
        // Pick the repo with the most nodes
        if (list.length > 0) {
          let bestRepo = list[0];
          let bestCount = 0;
          for (const r of list) {
            try {
              const stats = await getMemoryStats(r);
              if (stats.node_count > bestCount) {
                bestCount = stats.node_count;
                bestRepo = r;
              }
            } catch { /* skip */ }
          }
          setRepo(bestRepo);
          setRepoInput(bestRepo);
        } else {
          setRepo(urlRepo || "default");
          setRepoInput(urlRepo || "default");
        }
      })
      .catch(() => {
        setRepo(urlRepo || "default");
        setRepoInput(urlRepo || "default");
      });
  }, []);

  // Load stats when repo changes
  useEffect(() => {
    if (!repo) return;
    getMemoryStats(repo)
      .then(setStats)
      .catch(() => setStats(null));
  }, [repo]);

  // Traverse from a node ID
  const doTraverse = useCallback(
    async (nodeId: string, overrides?: { depth?: number; direction?: string }) => {
      setTraverseLoading(true);
      try {
        const result = await traverseMemory(nodeId, {
          max_depth: overrides?.depth ?? depth,
          direction: overrides?.direction ?? direction,
          max_nodes: 100,
        });
        setRawNodes(result.nodes);
        setRawEdges(result.edges);
        // Reset edge kind filter when graph changes
        setEdgeKinds([]);
      } catch {
        // Silently ignore traversal errors
      } finally {
        setTraverseLoading(false);
      }
    },
    [depth, direction],
  );

  // Load node detail when selectedNodeId changes
  useEffect(() => {
    if (!selectedNodeId) {
      setSelectedNode(null);
      setSelectedNodeEdges([]);
      return;
    }
    Promise.all([getMemoryNode(selectedNodeId), getMemoryNodeEdges(selectedNodeId)])
      .then(([node, edges]) => {
        setSelectedNode(node);
        setSelectedNodeEdges(edges);
      })
      .catch(() => {
        setSelectedNode(null);
        setSelectedNodeEdges([]);
      });
  }, [selectedNodeId]);

  // When a search result is selected
  const handleSelectNode = useCallback(
    (result: SearchResult) => {
      setSelectedNodeId(result.node_id);
      doTraverse(result.node_id);
    },
    [doTraverse],
  );

  // When graph canvas node is clicked
  const handleGraphNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  // When toolbar depth changes, re-traverse if we have a selected node
  const handleDepthChange = useCallback(
    (newDepth: number) => {
      setDepth(newDepth);
      if (selectedNodeId) {
        doTraverse(selectedNodeId, { depth: newDepth, direction });
      }
    },
    [selectedNodeId, doTraverse, direction],
  );

  // When toolbar direction changes, re-traverse
  const handleDirectionChange = useCallback(
    (newDir: "outgoing" | "incoming" | "both") => {
      setDirection(newDir);
      if (selectedNodeId) {
        doTraverse(selectedNodeId, { depth, direction: newDir });
      }
    },
    [selectedNodeId, doTraverse, depth],
  );

  // When a traversal log is selected, load its subgraph and initialize replay
  const handleSelectTraversal = useCallback(
    async (log: TraversalLog) => {
      replay.loadSteps(log.steps);
      if (log.start_node) {
        setSelectedNodeId(log.start_node);
        await doTraverse(log.start_node);
      } else if (log.steps.length > 0) {
        const firstNodeId = log.steps[0].node_id;
        setSelectedNodeId(firstNodeId);
        await doTraverse(firstNodeId);
      }
    },
    [doTraverse, replay],
  );

  return (
    <div
      style={{
        display: "flex",
        height: "calc(100vh - 56px)", // account for nav header
        background: "#0D0D0F",
        overflow: "hidden",
      }}
    >
      {/* Left column */}
      <div
        style={{
          width: 320,
          flexShrink: 0,
          borderRight: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "#1A1A1C",
        }}
      >
        {/* Repo header */}
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              background: "rgba(124,106,245,0.15)",
              border: "1px solid rgba(124,106,245,0.3)",
              borderRadius: 5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 14, height: 14, color: "#7C6AF5" }}
            >
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "rgba(255,255,255,0.87)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Memory Explorer
            </div>
            {stats && (
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.38)",
                  marginTop: 1,
                }}
              >
                {stats.node_count.toLocaleString()} nodes · {stats.edge_count.toLocaleString()} edges
              </div>
            )}
          </div>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <input
              type="text"
              value={repoInput}
              onChange={(e) => {
                setRepoInput(e.target.value);
                setRepoDropdownOpen(true);
              }}
              onFocus={() => setRepoDropdownOpen(true)}
              onBlur={() => {
                // Delay close so click on dropdown item registers
                setTimeout(() => setRepoDropdownOpen(false), 150);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setRepo(repoInput);
                  setRepoDropdownOpen(false);
                }
              }}
              placeholder="repo"
              style={{
                width: 140,
                fontSize: 11,
                padding: "3px 6px",
                background: "#222226",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 4,
                color: "rgba(255,255,255,0.87)",
                outline: "none",
              }}
            />
            {repoDropdownOpen && (() => {
              const filtered = repos.filter((r) =>
                r.toLowerCase().includes(repoInput.toLowerCase()),
              );
              if (filtered.length === 0) return null;
              return (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: 2,
                    background: "#222226",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 4,
                    maxHeight: 160,
                    overflowY: "auto",
                    zIndex: 100,
                  }}
                >
                  {filtered.map((r) => (
                    <div
                      key={r}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setRepoInput(r);
                        setRepo(r);
                        setRepoDropdownOpen(false);
                      }}
                      style={{
                        padding: "4px 8px",
                        fontSize: 11,
                        color:
                          r === repo
                            ? "#7C6AF5"
                            : "rgba(255,255,255,0.7)",
                        cursor: "pointer",
                        background:
                          r === repo
                            ? "rgba(124,106,245,0.1)"
                            : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background =
                          "rgba(255,255,255,0.06)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background =
                          r === repo
                            ? "rgba(124,106,245,0.1)"
                            : "transparent";
                      }}
                    >
                      {r}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Search panel (top half) */}
        <MemorySearchPanel
          repo={repo}
          onSelectNode={handleSelectNode}
          selectedNodeId={selectedNodeId}
          senders={senders}
          selectedSender={selectedSender}
          onSenderChange={setSelectedSender}
        />

        {/* Traversal log panel (bottom half) */}
        <TraversalLogPanel repo={repo} onSelectTraversal={handleSelectTraversal} />
      </div>

      {/* Center — graph canvas */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {/* Toolbar */}
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

        {/* Path replay controls — shown when a traversal log is loaded */}
        <PathReplay replay={replay} />

        {/* Graph canvas area */}
        <div
          style={{
            flex: 1,
            position: "relative",
            minHeight: 0,
          }}
          data-highlighted-count={highlightedNodeIds.length}
          data-replay-state={replay.state}
          data-replay-current-node={replay.currentNodeId ?? ""}
          data-replay-visited-count={replay.visitedNodeIds.size}
        >
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

          {layoutNodes.length === 0 && !traverseLoading && (
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
                  marginBottom: 12,
                }}
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>
                Select a memory node to explore relationships
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
                if (selectedNodeId) doTraverse(selectedNodeId);
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

