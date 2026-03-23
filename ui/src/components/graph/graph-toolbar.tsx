"use client";
import { EDGE_COLORS } from "./edge-styles";

interface GraphToolbarProps {
  depth: number;
  onDepthChange: (depth: number) => void;
  direction: "outgoing" | "incoming" | "both";
  onDirectionChange: (dir: "outgoing" | "incoming" | "both") => void;
  edgeKinds: string[];
  allEdgeKinds: string[];
  onEdgeKindsChange: (kinds: string[]) => void;
  senders: string[];
  selectedSender: string | null;
  onSenderChange: (sender: string | null) => void;
}

const DIRECTIONS = ["outgoing", "incoming", "both"] as const;

export function GraphToolbar({
  depth,
  onDepthChange,
  direction,
  onDirectionChange,
  edgeKinds,
  allEdgeKinds,
  onEdgeKindsChange,
  senders,
  selectedSender,
  onSenderChange,
}: GraphToolbarProps) {
  function handleEdgeKindToggle(kind: string) {
    if (edgeKinds.includes(kind)) {
      onEdgeKindsChange(edgeKinds.filter((k) => k !== kind));
    } else {
      onEdgeKindsChange([...edgeKinds, kind]);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "8px 16px",
        background: "#1A1A1C",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        flexWrap: "wrap",
        userSelect: "none",
      }}
    >
      {/* Depth slider */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.6)",
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          Depth
        </span>
        <input
          type="range"
          min={1}
          max={5}
          value={depth}
          onChange={(e) => onDepthChange(Number(e.target.value))}
          style={{ width: 80, cursor: "pointer", accentColor: "#7C6AF5" }}
        />
        <span
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.87)",
            fontWeight: 600,
            minWidth: 12,
            textAlign: "center",
          }}
        >
          {depth}
        </span>
      </div>

      {/* Separator */}
      <div
        style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }}
      />

      {/* Direction toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.6)",
            fontWeight: 500,
          }}
        >
          Direction
        </span>
        <div style={{ display: "flex", gap: 2 }}>
          {DIRECTIONS.map((dir) => {
            const isActive = direction === dir;
            return (
              <button
                key={dir}
                onClick={() => onDirectionChange(dir)}
                style={{
                  padding: "3px 10px",
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                  border: "1px solid",
                  borderRadius: 4,
                  borderColor: isActive
                    ? "#7C6AF5"
                    : "rgba(255,255,255,0.12)",
                  background: isActive
                    ? "rgba(124,106,245,0.2)"
                    : "rgba(255,255,255,0.04)",
                  color: isActive
                    ? "#7C6AF5"
                    : "rgba(255,255,255,0.6)",
                  transition: "all 0.15s ease",
                }}
              >
                {dir}
              </button>
            );
          })}
        </div>
      </div>

      {/* Separator */}
      <div
        style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }}
      />

      {/* Edge kind filter */}
      {allEdgeKinds.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.6)",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            Edges
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {allEdgeKinds.map((kind) => {
              const isChecked = edgeKinds.includes(kind);
              const color = EDGE_COLORS[kind] ?? "rgba(255,255,255,0.3)";
              return (
                <label
                  key={kind}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    cursor: "pointer",
                    fontSize: 11,
                    color: isChecked
                      ? "rgba(255,255,255,0.87)"
                      : "rgba(255,255,255,0.38)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleEdgeKindToggle(kind)}
                    style={{ display: "none" }}
                  />
                  {/* Custom checkbox */}
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      border: `1px solid ${isChecked ? color : "rgba(255,255,255,0.2)"}`,
                      background: isChecked
                        ? `${color}33`
                        : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "all 0.15s ease",
                    }}
                  >
                    {isChecked && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 1,
                          background: color,
                        }}
                      />
                    )}
                  </span>
                  {/* Colored dot */}
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: color,
                      flexShrink: 0,
                    }}
                  />
                  {kind}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Separator */}
      {allEdgeKinds.length > 0 && senders.length > 0 && (
        <div
          style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }}
        />
      )}

      {/* Sender filter */}
      {senders.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.6)",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            Sender
          </span>
          <select
            value={selectedSender ?? ""}
            onChange={(e) =>
              onSenderChange(e.target.value === "" ? null : e.target.value)
            }
            style={{
              fontSize: 11,
              padding: "3px 8px",
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
        </div>
      )}
    </div>
  );
}
