"use client";
import { useState, useCallback } from "react";
import { getMemoryContext, type ContextResponse } from "@/lib/memory-api";

interface ContextBuilderPanelProps {
  repo: string;
  query?: string;
  nodeId?: string;
  onHighlightNodes?: (nodeIds: string[]) => void;
}

function TokenBar({
  used,
  total,
}: {
  used: number;
  total: number;
}) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  // gradient: green → yellow → red based on fill percentage
  const color =
    pct < 50
      ? `hsl(${120 - pct * 1.2}, 70%, 50%)`
      : `hsl(${120 - pct * 1.2}, 70%, 50%)`;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "rgba(255,255,255,0.6)",
          marginBottom: 4,
        }}
      >
        <span>Tokens used</span>
        <span>
          {used.toLocaleString()} / {total.toLocaleString()}
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: `linear-gradient(90deg, #10B981 0%, #F59E0B 60%, #EF4444 100%)`,
            backgroundSize: `${(100 / Math.max(pct, 1)) * 100}% 100%`,
            backgroundPosition: "0 0",
            borderRadius: 3,
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

function RelevanceBar({ score }: { score: number }) {
  const pct = Math.min(Math.max(score, 0), 1) * 100;
  return (
    <div
      style={{
        height: 3,
        background: "rgba(255,255,255,0.08)",
        borderRadius: 2,
        overflow: "hidden",
        marginTop: 4,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: "#7C6AF5",
          borderRadius: 2,
        }}
      />
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

export function ContextBuilderPanel({
  repo,
  query: initialQuery = "",
  onHighlightNodes,
}: ContextBuilderPanelProps) {
  const [query, setQuery] = useState(initialQuery);
  const [maxTokens, setMaxTokens] = useState(2000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ContextResponse | null>(null);

  const handleAssemble = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const ctx = await getMemoryContext(trimmed, repo, maxTokens);
      setResult(ctx);

      if (onHighlightNodes) {
        // Collect all node_ids from sections
        // ContextSection doesn't have node_ids in the current type — but
        // if the server returns them we'll pick them up via type assertion.
        const nodeIds: string[] = [];
        for (const section of ctx.sections) {
          const s = section as typeof section & { node_ids?: string[] };
          if (Array.isArray(s.node_ids)) {
            nodeIds.push(...s.node_ids);
          }
        }
        if (nodeIds.length > 0) {
          onHighlightNodes(nodeIds);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [query, repo, maxTokens, onHighlightNodes]);

  return (
    <div
      style={{
        width: 320,
        background: "#1A1A1C",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
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
            fontSize: 13,
            fontWeight: 600,
            color: "rgba(255,255,255,0.87)",
          }}
        >
          Assemble Context
        </div>
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.38)",
            marginTop: 2,
          }}
        >
          Build a token-budgeted context from memory
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Query input */}
        <div>
          <label
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.6)",
              fontWeight: 500,
              display: "block",
              marginBottom: 6,
            }}
          >
            Query
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What context do you need?"
            rows={3}
            style={{
              width: "100%",
              fontSize: 12,
              color: "rgba(255,255,255,0.87)",
              background: "#222226",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 6,
              padding: "8px 10px",
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
              lineHeight: 1.5,
            }}
          />
        </div>

        {/* Token budget slider */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <label
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.6)",
                fontWeight: 500,
              }}
            >
              Token budget
            </label>
            <span
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.87)",
                fontWeight: 600,
              }}
            >
              {maxTokens.toLocaleString()}
            </span>
          </div>
          <input
            type="range"
            min={500}
            max={4000}
            step={100}
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
            style={{ width: "100%", cursor: "pointer", accentColor: "#7C6AF5" }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: "rgba(255,255,255,0.38)",
              marginTop: 2,
            }}
          >
            <span>500</span>
            <span>4,000</span>
          </div>
        </div>

        {/* Assemble button */}
        <button
          onClick={handleAssemble}
          disabled={loading || !query.trim()}
          style={{
            width: "100%",
            padding: "9px 0",
            fontSize: 12,
            fontWeight: 600,
            cursor: loading || !query.trim() ? "not-allowed" : "pointer",
            background:
              loading || !query.trim()
                ? "rgba(124,106,245,0.08)"
                : "rgba(124,106,245,0.2)",
            border: "1px solid",
            borderColor:
              loading || !query.trim()
                ? "rgba(124,106,245,0.15)"
                : "rgba(124,106,245,0.5)",
            borderRadius: 6,
            color:
              loading || !query.trim()
                ? "rgba(124,106,245,0.4)"
                : "#7C6AF5",
            transition: "all 0.15s ease",
          }}
        >
          {loading ? "Assembling…" : "Assemble Context"}
        </button>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
        {error && (
          <div
            style={{
              fontSize: 12,
              color: "#EF4444",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 6,
              padding: "8px 10px",
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {result && (
          <>
            {/* Summary */}
            {result.summary && (
              <Section title="Summary">
                <p
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.6)",
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {result.summary}
                </p>
              </Section>
            )}

            {/* Token usage bar */}
            <Section title="Token Usage">
              <TokenBar used={result.token_estimate} total={maxTokens} />
            </Section>

            {/* Sections list */}
            {result.sections.length > 0 && (
              <Section title={`Sections (${result.sections.length})`}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {result.sections.map((section, idx) => {
                    const s = section as typeof section & {
                      node_ids?: string[];
                    };
                    return (
                      <div
                        key={idx}
                        style={{
                          background: "#222226",
                          borderRadius: 6,
                          padding: "10px 12px",
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "rgba(255,255,255,0.87)",
                            marginBottom: 4,
                          }}
                        >
                          {section.heading}
                        </div>
                        <RelevanceBar score={section.relevance} />
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginTop: 6,
                            fontSize: 10,
                            color: "rgba(255,255,255,0.38)",
                          }}
                        >
                          <span>
                            ~{section.token_estimate.toLocaleString()} tokens
                          </span>
                          {Array.isArray(s.node_ids) &&
                            s.node_ids.length > 0 && (
                              <span>{s.node_ids.length} node{s.node_ids.length !== 1 ? "s" : ""}</span>
                            )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}
          </>
        )}

        {!result && !loading && !error && (
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.38)",
              textAlign: "center",
              paddingTop: 24,
            }}
          >
            Enter a query and assemble context from the memory graph.
          </div>
        )}
      </div>
    </div>
  );
}
