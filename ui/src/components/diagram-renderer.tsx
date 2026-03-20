"use client";

import { useEffect, useRef, useState, useId } from "react";

interface DiagramRendererProps {
  /** Mermaid diagram definition string */
  definition: string;
  /** Optional CSS class for the container */
  className?: string;
}

/**
 * Renders a Mermaid diagram from a definition string.
 * Abstracts the rendering library — swap Mermaid for another
 * renderer by changing only this component.
 */
export function DiagramRenderer({ definition, className }: DiagramRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const uniqueId = useId().replace(/:/g, "-");

  useEffect(() => {
    if (!containerRef.current || !definition) return;

    let cancelled = false;

    async function render() {
      try {
        // Dynamic import to avoid SSR issues
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "strict",
        });

        const { svg } = await mermaid.render(`diagram${uniqueId}`, definition);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to render diagram");
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [definition, uniqueId]);

  if (error) {
    return (
      <div className={`text-red-400 bg-red-950/20 p-4 rounded text-sm ${className ?? ""}`}>
        Diagram error: {error}
      </div>
    );
  }

  return <div ref={containerRef} className={className} />;
}
