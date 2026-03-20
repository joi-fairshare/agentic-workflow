import type { Message } from "./types";

/** Build a Mermaid LR directed graph with shortened edge labels. */
export function buildDirectedGraph(messages: Message[]): string {
  const edges = new Map<string, { count: number; kinds: Set<string> }>();
  for (const msg of messages) {
    const key = `${msg.sender}:::${msg.recipient}`;
    const existing = edges.get(key);
    if (existing) {
      existing.count++;
      existing.kinds.add(msg.kind);
    } else {
      edges.set(key, { count: 1, kinds: new Set([msg.kind]) });
    }
  }

  if (edges.size === 0) return "graph LR\n    empty[No messages]";

  const lines = ["graph LR"];
  for (const [key, { kinds }] of edges) {
    const [from, to] = key.split(":::");
    const fromId = from.replace(/[^a-zA-Z0-9_-]/g, "_");
    const toId = to.replace(/[^a-zA-Z0-9_-]/g, "_");
    const label = [...kinds].join(", ");
    lines.push(`    ${fromId}["${from}"] -->|"${label}"| ${toId}["${to}"]`);
  }
  return lines.join("\n");
}

/** Build a Mermaid sequence diagram with kind-prefixed messages. */
export function buildSequenceDiagram(messages: Message[]): string {
  if (messages.length === 0) return "sequenceDiagram\n    Note over empty: No messages";

  const lines = ["sequenceDiagram"];

  // Declare participants in order of first appearance
  const seen = new Set<string>();
  for (const msg of messages) {
    for (const agent of [msg.sender, msg.recipient]) {
      if (!seen.has(agent)) {
        seen.add(agent);
        lines.push(`    participant ${agent}`);
      }
    }
  }

  for (const msg of messages) {
    const synopsis =
      msg.payload.length > 40
        ? msg.payload.substring(0, 40).replace(/"/g, "'") + "..."
        : msg.payload.replace(/"/g, "'");
    lines.push(`    ${msg.sender}->>${msg.recipient}: ${msg.kind} — ${synopsis}`);
  }
  return lines.join("\n");
}
