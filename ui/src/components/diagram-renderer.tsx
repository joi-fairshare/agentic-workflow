"use client";

import { useEffect, useRef, useState, useId } from "react";

interface DiagramRendererProps {
  definition: string;
  className?: string;
}

export function DiagramRenderer({ definition, className }: DiagramRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const uniqueId = useId().replace(/:/g, "-");

  useEffect(() => {
    if (!containerRef.current || !definition) return;

    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          securityLevel: "strict",
          themeVariables: {
            // Core
            primaryColor: "rgba(124, 106, 245, 0.12)",
            primaryBorderColor: "rgba(124, 106, 245, 0.30)",
            primaryTextColor: "#FFFFFF",
            secondaryColor: "rgba(232, 160, 32, 0.12)",
            secondaryBorderColor: "rgba(232, 160, 32, 0.30)",
            secondaryTextColor: "#FFFFFF",
            tertiaryColor: "#222226",
            tertiaryBorderColor: "rgba(255, 255, 255, 0.08)",
            tertiaryTextColor: "#FFFFFF",
            lineColor: "#7C6AF5",
            textColor: "#FFFFFF",
            mainBkg: "#1A1A1C",
            nodeBorder: "rgba(124, 106, 245, 0.30)",
            clusterBkg: "#222226",
            clusterBorder: "rgba(255, 255, 255, 0.08)",
            titleColor: "#FFFFFF",
            edgeLabelBackground: "#1A1A1C",
            nodeTextColor: "#FFFFFF",
            // Sequence diagram
            actorBkg: "rgba(124, 106, 245, 0.12)",
            actorBorder: "rgba(124, 106, 245, 0.30)",
            actorTextColor: "#FFFFFF",
            actorLineColor: "rgba(255, 255, 255, 0.08)",
            signalColor: "#71717A",
            signalTextColor: "#FFFFFF",
            labelBoxBkgColor: "#1A1A1C",
            labelBoxBorderColor: "rgba(255, 255, 255, 0.08)",
            labelTextColor: "#FFFFFF",
            loopTextColor: "#71717A",
            activationBorderColor: "#7C6AF5",
            activationBkgColor: "rgba(124, 106, 245, 0.12)",
            sequenceNumberColor: "#0D0D0F",
            noteBkgColor: "rgba(232, 160, 32, 0.12)",
            noteBorderColor: "rgba(232, 160, 32, 0.30)",
            noteTextColor: "#FFFFFF",
            // Flowchart
            background: "#0D0D0F",
            fontFamily: "Space Grotesk, system-ui, sans-serif",
            fontSize: "15px",
          },
          flowchart: {
            htmlLabels: true,
            curve: "basis",
            padding: 16,
            nodeSpacing: 40,
            rankSpacing: 50,
          },
          sequence: {
            diagramMarginX: 16,
            diagramMarginY: 16,
            actorMargin: 60,
            width: 140,
            height: 44,
            boxMargin: 8,
            boxTextMargin: 8,
            noteMargin: 12,
            messageMargin: 40,
            mirrorActors: false,
            useMaxWidth: true,
          },
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
    return () => { cancelled = true; };
  }, [definition, uniqueId]);

  if (error) {
    return (
      <div className={`text-error bg-error-dim p-4 rounded-xs text-sm ${className ?? ""}`}>
        Diagram error: {error}
      </div>
    );
  }

  return <div ref={containerRef} className={className} />;
}
