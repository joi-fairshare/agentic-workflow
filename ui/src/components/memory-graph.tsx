"use client";

import { useMemo } from "react";
import { DiagramRenderer } from "@/components/diagram-renderer";
import type { NodeResponse, EdgeResponse } from "@/lib/memory-api";

interface MemoryGraphProps {
  nodes: NodeResponse[];
  edges: EdgeResponse[];
  className?: string;
}

function sanitizeId(id: string): string {
  // Replace characters that are not alphanumeric or underscore with underscore
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

function buildMemoryGraph(nodes: NodeResponse[], edges: EdgeResponse[]): string {
  if (nodes.length === 0) return "";

  const lines: string[] = ["graph TD"];

  for (const node of nodes) {
    const safeId = sanitizeId(node.id);
    // Escape quotes in title
    const label = `${node.title.replace(/"/g, "'").slice(0, 40)} (${node.kind})`;
    lines.push(`  ${safeId}["${label}"]`);
  }

  // Build a set of node ids for fast lookup
  const nodeIds = new Set(nodes.map((n) => n.id));

  for (const edge of edges) {
    // Only render edges where both endpoints are in the node set
    if (!nodeIds.has(edge.from_node) || !nodeIds.has(edge.to_node)) continue;
    const fromId = sanitizeId(edge.from_node);
    const toId = sanitizeId(edge.to_node);
    const edgeLabel = edge.kind.replace(/"/g, "'");
    lines.push(`  ${fromId} -->|${edgeLabel}| ${toId}`);
  }

  return lines.join("\n");
}

export function MemoryGraph({ nodes, edges, className }: MemoryGraphProps) {
  const definition = useMemo(() => buildMemoryGraph(nodes, edges), [nodes, edges]);

  if (!definition) {
    return (
      <div className={`flex items-center justify-center py-[var(--s8)] text-text-tertiary text-sm ${className ?? ""}`}>
        No graph data
      </div>
    );
  }

  return <DiagramRenderer definition={definition} className={className} />;
}
