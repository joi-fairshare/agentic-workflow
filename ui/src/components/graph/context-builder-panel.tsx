"use client";
import { useState, useCallback, useEffect } from "react";
import { getMemoryContext, type ContextResponse } from "@/lib/memory-api";

interface ContextBuilderPanelProps {
  repo: string;
  query?: string;
  nodeId?: string;
  onHighlightNodes?: (nodeIds: string[]) => void;
}

function formatContextMarkdown(result: ContextResponse, query: string): string {
  const lines: string[] = [];
  if (result.summary) {
    lines.push(result.summary, "");
  }
  for (const section of result.sections) {
    lines.push(`## ${section.heading}`, "");
    if (section.content) {
      lines.push(section.content, "");
    }
  }
  return lines.join("\n").trimEnd();
}

function TokenBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
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

function SectionCard({
  heading,
  content,
  relevance,
  tokenEstimate,
  nodeCount,
}: {
  heading: string;
  content: string;
  relevance: number;
  tokenEstimate: number;
  nodeCount: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: "#222226",
        borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.06)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          padding: "10px 12px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          display: "block",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="currentColor"
            style={{
              width: 12,
              height: 12,
              color: "rgba(255,255,255,0.38)",
              flexShrink: 0,
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
            }}
          >
            <path d="M6 3l5 5-5 5z" />
          </svg>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "rgba(255,255,255,0.87)",
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {heading}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 4,
            paddingLeft: 18,
            fontSize: 10,
            color: "rgba(255,255,255,0.38)",
          }}
        >
          <span>~{tokenEstimate.toLocaleString()} tokens</span>
          {nodeCount > 0 && (
            <span>
              {nodeCount} node{nodeCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div style={{ paddingLeft: 18 }}>
          <RelevanceBar score={relevance} />
        </div>
      </button>

      {expanded && content && (
        <div
          style={{
            padding: "0 12px 10px 12px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              marginTop: 8,
              maxHeight: 300,
              overflowY: "auto",
            }}
          >
            {content}
          </div>
        </div>
      )}
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

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ContextResponse | null>(null);
  const [copied, setCopied] = useState(false);

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
        const nodeIds: string[] = [];
        for (const section of ctx.sections) {
          if (Array.isArray(section.node_ids)) {
            nodeIds.push(...section.node_ids);
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

  const handleCopy = useCallback(() => {
    if (!result) return;
    const text = formatContextMarkdown(result, query);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [result, query]);

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
      {/* Controls — collapsible when results exist */}
      <div
        style={{
          padding: result ? "10px 16px" : "14px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: result ? 8 : 12,
        }}
      >
        {!result ? (
          <>
            {/* Full controls mode */}
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "rgba(255,255,255,0.87)",
              }}
            >
              Assemble Context
            </div>

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
                rows={2}
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

            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 4,
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
                style={{
                  width: "100%",
                  cursor: "pointer",
                  accentColor: "#7C6AF5",
                }}
              />
            </div>

            <button
              onClick={handleAssemble}
              disabled={loading || !query.trim()}
              style={{
                width: "100%",
                padding: "9px 0",
                fontSize: 12,
                fontWeight: 600,
                cursor:
                  loading || !query.trim() ? "not-allowed" : "pointer",
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
              {loading ? "Assembling..." : "Assemble Context"}
            </button>
          </>
        ) : (
          <>
            {/* Compact mode — results are showing */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.6)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={query}
              >
                {query}
              </div>
              <button
                onClick={() => setResult(null)}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.5)",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 4,
                  padding: "3px 8px",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                Edit
              </button>
            </div>
            <TokenBar used={result.token_estimate} total={maxTokens} />
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            margin: "12px 16px 0",
            fontSize: 12,
            color: "#EF4444",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 6,
            padding: "8px 10px",
            flexShrink: 0,
          }}
        >
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Copy button — sticky at top of results */}
          <div
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              flexShrink: 0,
            }}
          >
            <button
              onClick={handleCopy}
              style={{
                width: "100%",
                padding: "8px 0",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                background: copied
                  ? "rgba(16,185,129,0.15)"
                  : "rgba(124,106,245,0.15)",
                border: "1px solid",
                borderColor: copied
                  ? "rgba(16,185,129,0.4)"
                  : "rgba(124,106,245,0.4)",
                borderRadius: 6,
                color: copied ? "#10B981" : "#7C6AF5",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {copied ? (
                <>
                  <svg
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    style={{ width: 14, height: 14 }}
                  >
                    <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                  </svg>
                  Copied to clipboard
                </>
              ) : (
                <>
                  <svg
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    style={{ width: 14, height: 14 }}
                  >
                    <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z" />
                    <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z" />
                  </svg>
                  Copy Context
                </>
              )}
            </button>
          </div>

          {/* Scrollable result content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
            {result.summary && (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.38)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 6,
                  }}
                >
                  Summary
                </div>
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
              </div>
            )}

            {result.sections.length > 0 && (
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
                  Sections ({result.sections.length})
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {result.sections.map((section, idx) => (
                    <SectionCard
                      key={idx}
                      heading={section.heading}
                      content={section.content}
                      relevance={section.relevance}
                      tokenEstimate={section.token_estimate}
                      nodeCount={
                        Array.isArray(section.node_ids)
                          ? section.node_ids.length
                          : 0
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Empty state */}
      {!result && !loading && !error && (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.38)",
              textAlign: "center",
            }}
          >
            Enter a query and assemble context from the memory graph.
          </div>
        </div>
      )}
    </div>
  );
}
