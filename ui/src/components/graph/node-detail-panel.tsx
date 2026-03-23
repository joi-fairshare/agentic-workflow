"use client";
import type { NodeResponse, EdgeResponse } from "@/lib/memory-api";

interface NodeDetailPanelProps {
  node: NodeResponse | null;
  edges: EdgeResponse[];
  onExpandClick?: (nodeId: string) => void;
}

const KIND_COLORS: Record<string, string> = {
  message: "#3B82F6",
  conversation: "#7C6AF5",
  topic: "#10B981",
  decision: "#F59E0B",
  task: "#EF4444",
  artifact: "#8B5CF6",
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function truncateId(id: string, max = 16): string {
  if (id.length <= max) return id;
  return id.slice(0, max) + "…";
}

function MetaTable({ meta }: { meta: Record<string, unknown> }) {
  const entries = Object.entries(meta).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {entries.map(([key, value]) => (
        <div key={key} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.38)",
              fontWeight: 500,
              minWidth: 80,
              flexShrink: 0,
            }}
          >
            {key}
          </span>
          <span
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.6)",
              wordBreak: "break-all",
            }}
          >
            {typeof value === "object"
              ? JSON.stringify(value)
              : String(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "rgba(255,255,255,0.38)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

export function NodeDetailPanel({
  node,
  edges,
  onExpandClick,
}: NodeDetailPanelProps) {
  if (!node) {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          background: "#1A1A1C",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.38)",
            textAlign: "center",
          }}
        >
          Select a node to view details
        </span>
      </div>
    );
  }

  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(node.meta ?? "{}") as Record<string, unknown>;
  } catch {
    // ignore
  }

  const kindColor = KIND_COLORS[node.kind] ?? "#71717A";
  const sender =
    typeof meta.sender === "string" && meta.sender ? meta.sender : null;
  const showExpandButton =
    node.kind === "message" && meta.expanded === false && onExpandClick;

  const outgoingEdges = edges.filter((e) => e.from_node === node.id);
  const incomingEdges = edges.filter((e) => e.to_node === node.id);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        background: "#1A1A1C",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: kindColor,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              background: `${kindColor}22`,
              padding: "2px 8px",
              borderRadius: 4,
              border: `1px solid ${kindColor}44`,
            }}
          >
            {node.kind}
          </span>
          {sender && (
            <span
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.6)",
                marginLeft: "auto",
              }}
            >
              {sender}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "rgba(255,255,255,0.87)",
            lineHeight: 1.4,
          }}
        >
          {node.title}
        </div>
      </div>

      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "14px 16px",
        }}
      >
        {/* Body */}
        {node.body && (
          <Section title="Body">
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.6)",
                lineHeight: 1.6,
                maxHeight: 300,
                overflowY: "auto",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 6,
                padding: "8px 10px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {node.body}
            </div>
          </Section>
        )}

        {/* Metadata */}
        {Object.keys(meta).length > 0 && (
          <Section title="Metadata">
            <MetaTable meta={meta} />
          </Section>
        )}

        {/* Timestamps */}
        <Section title="Timestamps">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <span
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.38)",
                  minWidth: 70,
                }}
              >
                Created
              </span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                {formatTimestamp(node.created_at)}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.38)",
                  minWidth: 70,
                }}
              >
                Updated
              </span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                {formatTimestamp(node.updated_at)}
              </span>
            </div>
          </div>
        </Section>

        {/* Edges */}
        {(outgoingEdges.length > 0 || incomingEdges.length > 0) && (
          <Section title="Edges">
            {outgoingEdges.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.38)",
                    marginBottom: 4,
                  }}
                >
                  Outgoing ({outgoingEdges.length})
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 3 }}
                >
                  {outgoingEdges.map((edge) => (
                    <div
                      key={edge.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 11,
                        padding: "3px 6px",
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: 4,
                      }}
                    >
                      <span
                        style={{
                          color: "#7C6AF5",
                          fontWeight: 500,
                          flexShrink: 0,
                        }}
                      >
                        {edge.kind}
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.38)" }}>→</span>
                      <span
                        style={{
                          color: "rgba(255,255,255,0.6)",
                          fontFamily: "monospace",
                          fontSize: 10,
                        }}
                      >
                        {truncateId(edge.to_node)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {incomingEdges.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.38)",
                    marginBottom: 4,
                  }}
                >
                  Incoming ({incomingEdges.length})
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 3 }}
                >
                  {incomingEdges.map((edge) => (
                    <div
                      key={edge.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 11,
                        padding: "3px 6px",
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: 4,
                      }}
                    >
                      <span
                        style={{
                          color: "rgba(255,255,255,0.6)",
                          fontFamily: "monospace",
                          fontSize: 10,
                        }}
                      >
                        {truncateId(edge.from_node)}
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.38)" }}>→</span>
                      <span
                        style={{
                          color: "#7C6AF5",
                          fontWeight: 500,
                          flexShrink: 0,
                        }}
                      >
                        {edge.kind}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>
        )}
      </div>

      {/* Expand button */}
      {showExpandButton && (
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => onExpandClick(node.id)}
            style={{
              width: "100%",
              padding: "8px 0",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              background: "rgba(124,106,245,0.15)",
              border: "1px solid rgba(124,106,245,0.4)",
              borderRadius: 6,
              color: "#7C6AF5",
              transition: "all 0.15s ease",
            }}
          >
            Expand Node
          </button>
        </div>
      )}
    </div>
  );
}
