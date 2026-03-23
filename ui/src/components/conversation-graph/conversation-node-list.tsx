"use client";

import type { NodeResponse } from "@/lib/memory-api";

const KIND_COLORS: Record<string, string> = {
  message: "#3B82F6",
  conversation: "#7C6AF5",
  topic: "#10B981",
  decision: "#F59E0B",
  task: "#EF4444",
  artifact: "#8B5CF6",
};

const DEFAULT_KIND_COLOR = "#71717A";

function getNodeSender(node: NodeResponse): string | null {
  if (node.sender) return node.sender;
  try {
    const meta = JSON.parse(node.meta ?? "{}") as Record<string, unknown>;
    if (typeof meta.sender === "string" && meta.sender) return meta.sender;
  } catch {
    // ignore
  }
  return null;
}

interface ConversationNodeListProps {
  nodes: NodeResponse[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  senderFilter: string | null;
  onSenderFilterChange: (sender: string | null) => void;
}

export function ConversationNodeList({
  nodes,
  selectedNodeId,
  onSelectNode,
  senderFilter,
  onSenderFilterChange,
}: ConversationNodeListProps) {
  // Sort nodes by timestamp descending
  const sorted = [...nodes].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  // Derive unique senders
  const senders = Array.from(
    new Set(
      nodes
        .map(getNodeSender)
        .filter((s): s is string => s !== null),
    ),
  ).sort();

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        borderRight: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#1A1A1C",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "rgba(255,255,255,0.87)",
            marginBottom: 8,
          }}
        >
          Nodes ({nodes.length})
        </div>

        {/* Sender filter */}
        {senders.length > 0 && (
          <select
            value={senderFilter ?? ""}
            onChange={(e) =>
              onSenderFilterChange(e.target.value === "" ? null : e.target.value)
            }
            style={{
              width: "100%",
              fontSize: 11,
              padding: "4px 8px",
              background: "#222226",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 4,
              color: "rgba(255,255,255,0.87)",
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="">All senders</option>
            {senders.map((sender) => (
              <option key={sender} value={sender}>
                {sender}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Node list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {sorted.length === 0 ? (
          <div
            style={{
              padding: 20,
              fontSize: 12,
              color: "rgba(255,255,255,0.38)",
              textAlign: "center",
            }}
          >
            No nodes found
          </div>
        ) : (
          sorted.map((node) => {
            const isSelected = node.id === selectedNodeId;
            const kindColor = KIND_COLORS[node.kind] ?? DEFAULT_KIND_COLOR;
            const sender = getNodeSender(node);

            return (
              <button
                key={node.id}
                onClick={() => onSelectNode(node.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  background: isSelected
                    ? "rgba(124,106,245,0.12)"
                    : "transparent",
                  borderLeft: isSelected
                    ? "2px solid #7C6AF5"
                    : "2px solid transparent",
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                }}
              >
                {/* Kind badge + sender */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: kindColor,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      background: `${kindColor}22`,
                      padding: "1px 5px",
                      borderRadius: 3,
                      border: `1px solid ${kindColor}44`,
                      flexShrink: 0,
                    }}
                  >
                    {node.kind}
                  </span>
                  {sender && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "rgba(255,255,255,0.38)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {sender}
                    </span>
                  )}
                </div>

                {/* Title */}
                <div
                  style={{
                    fontSize: 12,
                    color: isSelected
                      ? "rgba(255,255,255,0.87)"
                      : "rgba(255,255,255,0.6)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    lineHeight: 1.4,
                  }}
                >
                  {node.title}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
