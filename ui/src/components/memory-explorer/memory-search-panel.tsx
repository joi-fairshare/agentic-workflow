"use client";
import { useCallback } from "react";
import { useMemorySearch } from "@/hooks/use-memory-search";
import type { SearchResult } from "@/lib/memory-api";

interface MemorySearchPanelProps {
  repo: string;
  onSelectNode: (result: SearchResult) => void;
  selectedNodeId: string | null;
  senders?: string[];
  selectedSender?: string | null;
  onSenderChange?: (sender: string | null) => void;
}

const SEARCH_MODES = [
  { value: "hybrid", label: "Hybrid" },
  { value: "keyword", label: "Keyword" },
  { value: "semantic", label: "Semantic" },
];

const KIND_OPTIONS = [
  "message",
  "conversation",
  "topic",
  "decision",
  "artifact",
  "task",
];

const MATCH_TYPE_LABELS: Record<string, string> = {
  keyword: "K",
  semantic: "S",
  hybrid: "H",
};

const MATCH_TYPE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  keyword: { bg: "rgba(59,130,246,0.12)", color: "#3B82F6", border: "rgba(59,130,246,0.3)" },
  semantic: { bg: "rgba(124,106,245,0.12)", color: "#7C6AF5", border: "rgba(124,106,245,0.3)" },
  hybrid: { bg: "rgba(16,185,129,0.12)", color: "#10B981", border: "rgba(16,185,129,0.3)" },
};

const KIND_COLORS: Record<string, string> = {
  message: "#3B82F6",
  conversation: "#7C6AF5",
  topic: "#10B981",
  decision: "#F59E0B",
  task: "#EF4444",
  artifact: "#8B5CF6",
};

export function MemorySearchPanel({
  repo,
  onSelectNode,
  selectedNodeId,
  senders = [],
  selectedSender = null,
  onSenderChange,
}: MemorySearchPanelProps) {
  const search = useMemorySearch(repo);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") search.search();
    },
    [search],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "50%",
        background: "#1A1A1C",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 14px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(255,255,255,0.38)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 8,
          }}
        >
          Search Memory
        </div>

        {/* Search input */}
        <div style={{ position: "relative", marginBottom: 8 }}>
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              position: "absolute",
              left: 9,
              top: "50%",
              transform: "translateY(-50%)",
              width: 13,
              height: 13,
              color: "rgba(255,255,255,0.38)",
              pointerEvents: "none",
            }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            aria-label="Search memory"
            placeholder="Search memory nodes..."
            value={search.query}
            onChange={(e) => search.setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: "100%",
              paddingLeft: 28,
              paddingRight: 8,
              paddingTop: 6,
              paddingBottom: 6,
              fontSize: 12,
              color: "rgba(255,255,255,0.87)",
              background: "#222226",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 5,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Mode + Search button row */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 2, flex: 1 }}>
            {SEARCH_MODES.map((m) => {
              const isActive = search.mode === m.value;
              return (
                <button
                  key={m.value}
                  onClick={() => search.setMode(m.value)}
                  style={{
                    flex: 1,
                    padding: "4px 0",
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: "pointer",
                    border: "1px solid",
                    borderRadius: 4,
                    borderColor: isActive ? "#7C6AF5" : "rgba(255,255,255,0.12)",
                    background: isActive ? "rgba(124,106,245,0.18)" : "rgba(255,255,255,0.04)",
                    color: isActive ? "#7C6AF5" : "rgba(255,255,255,0.6)",
                    transition: "all 0.12s ease",
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => search.search()}
            disabled={search.loading || !search.query.trim()}
            style={{
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 600,
              cursor: search.loading || !search.query.trim() ? "not-allowed" : "pointer",
              border: "1px solid",
              borderRadius: 4,
              borderColor:
                search.loading || !search.query.trim()
                  ? "rgba(124,106,245,0.2)"
                  : "rgba(124,106,245,0.5)",
              background:
                search.loading || !search.query.trim()
                  ? "rgba(124,106,245,0.06)"
                  : "rgba(124,106,245,0.18)",
              color:
                search.loading || !search.query.trim()
                  ? "rgba(124,106,245,0.4)"
                  : "#7C6AF5",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {search.loading ? "…" : "Search"}
          </button>
        </div>

        {/* Kind filter chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {KIND_OPTIONS.map((kind) => {
            const isActive = search.selectedKinds.includes(kind);
            const color = KIND_COLORS[kind] ?? "#71717A";
            return (
              <button
                key={kind}
                onClick={() => search.toggleKind(kind)}
                style={{
                  padding: "2px 8px",
                  fontSize: 10,
                  fontWeight: 500,
                  cursor: "pointer",
                  border: "1px solid",
                  borderRadius: 999,
                  borderColor: isActive ? `${color}66` : "rgba(255,255,255,0.1)",
                  background: isActive ? `${color}22` : "transparent",
                  color: isActive ? color : "rgba(255,255,255,0.5)",
                  transition: "all 0.12s ease",
                }}
              >
                {kind}
              </button>
            );
          })}
          {search.selectedKinds.length > 0 && (
            <button
              onClick={search.clearKinds}
              style={{
                padding: "2px 6px",
                fontSize: 10,
                cursor: "pointer",
                border: "none",
                background: "transparent",
                color: "rgba(255,255,255,0.38)",
              }}
            >
              clear
            </button>
          )}
        </div>

        {/* Sender filter */}
        {senders.length > 0 && onSenderChange && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", flexShrink: 0 }}>
              Sender
            </span>
            <select
              value={selectedSender ?? ""}
              onChange={(e) => onSenderChange(e.target.value === "" ? null : e.target.value)}
              style={{
                flex: 1,
                fontSize: 11,
                padding: "3px 6px",
                background: "#222226",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 4,
                color: "rgba(255,255,255,0.87)",
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="">All senders</option>
              {senders.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Results list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {search.error && (
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
            {search.error}
          </div>
        )}

        {search.results.length === 0 && !search.loading && !search.error && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px 16px",
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
              style={{ width: 32, height: 32, color: "rgba(255,255,255,0.2)", marginBottom: 8 }}
            >
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)" }}>
              Enter a query and search
            </div>
          </div>
        )}

        {search.results.map((result) => {
          const isSelected = result.node_id === selectedNodeId;
          const matchColors = MATCH_TYPE_COLORS[result.match_type] ?? MATCH_TYPE_COLORS.hybrid;
          const kindColor = KIND_COLORS[result.kind] ?? "#71717A";
          return (
            <button
              key={result.node_id}
              onClick={() => onSelectNode(result)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                background: isSelected ? "rgba(124,106,245,0.1)" : "transparent",
                borderLeft: `2px solid ${isSelected ? "#7C6AF5" : "transparent"}`,
                border: "none",
                borderLeftStyle: "solid",
                borderLeftWidth: 2,
                borderLeftColor: isSelected ? "#7C6AF5" : "transparent",
                cursor: "pointer",
                transition: "all 0.12s ease",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(255,255,255,0.03)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }
              }}
            >
              {/* Title row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 6,
                  marginBottom: 3,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "rgba(255,255,255,0.87)",
                    flex: 1,
                    lineHeight: 1.4,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {result.title}
                </div>
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: matchColors.bg,
                    color: matchColors.color,
                    border: `1px solid ${matchColors.border}`,
                  }}
                >
                  {MATCH_TYPE_LABELS[result.match_type] ?? result.match_type}
                </span>
              </div>

              {/* Body preview */}
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.5)",
                  lineHeight: 1.5,
                  marginBottom: 5,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {result.body}
              </div>

              {/* Footer */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: kindColor,
                    background: `${kindColor}1A`,
                    border: `1px solid ${kindColor}33`,
                    padding: "1px 5px",
                    borderRadius: 3,
                  }}
                >
                  {result.kind}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.3)",
                    marginLeft: "auto",
                  }}
                >
                  {result.score.toFixed(3)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
