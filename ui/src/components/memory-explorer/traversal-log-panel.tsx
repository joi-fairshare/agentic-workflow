"use client";
import { useEffect } from "react";
import { useTraversalLogs } from "@/hooks/use-traversal-logs";
import type { TraversalLog } from "@/lib/memory-api";

interface TraversalLogPanelProps {
  repo: string;
  onSelectTraversal: (log: TraversalLog) => void;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function TraversalLogPanel({ repo, onSelectTraversal }: TraversalLogPanelProps) {
  const { logs, loading, error, fetchLogs } = useTraversalLogs(repo);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "50%",
        background: "#1A1A1C",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 14px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(255,255,255,0.38)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Traversal Logs
        </div>
        <button
          onClick={() => fetchLogs()}
          disabled={loading}
          style={{
            fontSize: 11,
            padding: "2px 8px",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 4,
            color: loading ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.5)",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {/* Log list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {error && (
          <div
            style={{
              margin: "8px 12px",
              padding: "7px 10px",
              fontSize: 11,
              color: "#EF4444",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 5,
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && logs.length === 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px 16px",
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
              style={{ width: 28, height: 28, color: "rgba(255,255,255,0.2)", marginBottom: 8 }}
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
              No traversal logs recorded
            </div>
          </div>
        )}

        {logs.map((log) => (
          <button
            key={log.id}
            onClick={() => onSelectTraversal(log)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "8px 12px",
              background: "transparent",
              border: "none",
              borderLeft: "2px solid transparent",
              cursor: "pointer",
              transition: "background 0.12s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "rgba(255,255,255,0.03)";
              (e.currentTarget as HTMLButtonElement).style.borderLeftColor =
                "rgba(124,106,245,0.4)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.borderLeftColor = "transparent";
            }}
          >
            {/* Agent + Operation row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 3,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.87)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}
              >
                {log.agent}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: "#7C6AF5",
                  background: "rgba(124,106,245,0.12)",
                  border: "1px solid rgba(124,106,245,0.25)",
                  padding: "1px 5px",
                  borderRadius: 3,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {log.operation}
              </span>
            </div>

            {/* Steps count + timestamp row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.38)" }}>
                {log.steps.length} step{log.steps.length !== 1 ? "s" : ""}
              </span>
              {log.start_node && (
                <>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>·</span>
                  <span
                    style={{
                      fontSize: 10,
                      color: "rgba(255,255,255,0.3)",
                      fontFamily: "monospace",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 80,
                    }}
                  >
                    {log.start_node.slice(0, 12)}…
                  </span>
                </>
              )}
              <span
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.25)",
                  marginLeft: "auto",
                  whiteSpace: "nowrap",
                }}
              >
                {formatTimestamp(log.created_at)}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
