import type { Message } from "./types";

/** Build a Mermaid LR directed graph with shortened edge labels. */
export function buildDirectedGraph(messages: Message[]): string {
  const edges = new Map<string, Set<string>>();
  for (const msg of messages) {
    const from = msg.sender || "unknown";
    const to = msg.recipient || "unknown";
    const key = `${from}:::${to}`;
    const existing = edges.get(key);
    if (existing) {
      existing.add(msg.kind);
    } else {
      edges.set(key, new Set([msg.kind]));
    }
  }

  if (edges.size === 0) return "graph LR\n    empty[No messages]";

  const lines = ["graph LR"];
  for (const [key, kinds] of edges) {
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
    for (const agent of [msg.sender || "unknown", msg.recipient || "unknown"]) {
      if (!seen.has(agent)) {
        seen.add(agent);
        const safeId = agent.replace(/[^a-zA-Z0-9_-]/g, "_");
        lines.push(`    participant ${safeId} as ${agent}`);
      }
    }
  }

  for (const msg of messages) {
    const raw =
      msg.payload.length > 40
        ? msg.payload.substring(0, 40) + "..."
        : msg.payload;
    // Mermaid sequence diagram message text must not contain characters
    // that act as syntax delimiters: colons, semicolons, hashes, quotes,
    // newlines, and angle brackets can all trigger parse errors.
    const synopsis = raw.replace(/[":;<>#{}|\\]/g, "'").replace(/[\n\r]+/g, " ");
    const fromId = (msg.sender || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
    const toId = (msg.recipient || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
    lines.push(`    ${fromId}->>${toId}: ${msg.kind} — ${synopsis}`);
  }
  return lines.join("\n");
}
