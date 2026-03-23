export interface EdgeStyle {
  stroke: string;
  strokeDasharray: string;
  animated: boolean;
}

export const EDGE_COLORS: Record<string, string> = {
  contains: "#7C6AF5",
  spawned: "#3B82F6",
  assigned_in: "#EF4444",
  reply_to: "#3B82F6",
  led_to: "#F59E0B",
  discussed_in: "#10B981",
  decided_in: "#F59E0B",
  implemented_by: "#8B5CF6",
  references: "rgba(255,255,255,0.3)",
  related_to: "rgba(255,255,255,0.3)",
};

type DashStyle = "solid" | "dashed" | "dotted";

const EDGE_DASH_STYLES: Record<string, DashStyle> = {
  contains: "solid",
  spawned: "dashed",
  assigned_in: "solid",
  reply_to: "dotted",
  led_to: "solid",
  discussed_in: "solid",
  decided_in: "solid",
  implemented_by: "solid",
  references: "dashed",
  related_to: "dotted",
};

function dashStyleToStrokeDasharray(style: DashStyle): string {
  switch (style) {
    case "dashed":
      return "6 3";
    case "dotted":
      return "2 3";
    case "solid":
    default:
      return "0";
  }
}

export function getEdgeStyle(kind: string): EdgeStyle {
  const stroke = EDGE_COLORS[kind] ?? "rgba(255,255,255,0.3)";
  const dashStyle = EDGE_DASH_STYLES[kind] ?? "solid";
  const strokeDasharray = dashStyleToStrokeDasharray(dashStyle);
  const animated = kind === "spawned" || kind === "led_to";

  return { stroke, strokeDasharray, animated };
}
