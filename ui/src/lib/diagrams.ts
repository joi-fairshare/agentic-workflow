import type { Message } from "./types";

/** Build a Mermaid directed graph showing agent-to-agent message counts. */
export function buildDirectedGraph(messages: Message[]): string {
  const edges = new Map<string, number>();
  for (const msg of messages) {
    const key = `${msg.sender}:::${msg.recipient}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }

  if (edges.size === 0) return "graph LR\n    empty[No messages]";

  const lines = ["graph LR"];
  for (const [key, count] of edges) {
    const [from, to] = key.split(":::");
    // Sanitize node IDs for Mermaid (replace special chars)
    const fromId = from.replace(/[^a-zA-Z0-9_-]/g, "_");
    const toId = to.replace(/[^a-zA-Z0-9_-]/g, "_");
    lines.push(`    ${fromId}["${from}"] -->|${count}| ${toId}["${to}"]`);
  }
  return lines.join("\n");
}

/** Build a Mermaid sequence diagram showing temporal message flow. */
export function buildSequenceDiagram(messages: Message[]): string {
  if (messages.length === 0) return "sequenceDiagram\n    Note over empty: No messages";

  const lines = ["sequenceDiagram"];
  for (const msg of messages) {
    const synopsis =
      msg.payload.length > 50
        ? msg.payload.substring(0, 50).replace(/"/g, "'") + "..."
        : msg.payload.replace(/"/g, "'");
    const from = msg.sender;
    const to = msg.recipient;
    lines.push(`    ${from}->>${to}: [${msg.kind}] ${synopsis}`);
  }
  return lines.join("\n");
}
