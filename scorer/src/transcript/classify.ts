export type UserTextKind =
  | { kind: "user"; sub: "continue" | "correction" | "other" }
  | { kind: "interrupt" }
  | { kind: "teammate"; sub: "idle" | "terminate" | "text"; from: string | null }
  | { kind: "machine" };

const MACHINE_PREFIXES = [
  "Base directory for this skill",
  "<command-name>",
  "<command-message>",
  "<local-command-",
  "<system-reminder>",
  "<task-notification>",
  "Caveat:",
  "This session is being continued",
  "<bash-input>",
  "<bash-stdout>",
];
const CROSS_SESSION = "Another Claude session sent a message";
const TEAMMATE = /^(?:Another Claude session sent a message:\s*)?<teammate-message\b([^>]*)>\s*([\s\S]*)$/;
const CONTINUE = /^(?:continue|go|go ahead|yes|y|ok|okay|k|sure|proceed|do it|keep going|yep|yeah|next)[.!]*$/i;
const CORRECTION = /^(?:no\b|nope\b|wrong\b|that'?s not\b|not what\b|stop\b|don'?t\b|do not\b|actually\b)/i;

export function classifyUserText(raw: string): UserTextKind {
  const text = raw.trim();
  if (text.startsWith("[Request interrupted by user")) return { kind: "interrupt" };
  const tm = TEAMMATE.exec(text);
  if (tm) return { kind: "teammate", ...teammateKind(tm[1], tm[2]) };
  if (text.startsWith(CROSS_SESSION)) return { kind: "teammate", sub: "text", from: null };
  if (text === "" || MACHINE_PREFIXES.some((p) => text.startsWith(p))) return { kind: "machine" };
  if (CONTINUE.test(text)) return { kind: "user", sub: "continue" };
  if (CORRECTION.test(text)) return { kind: "user", sub: "correction" };
  return { kind: "user", sub: "other" };
}

function teammateKind(attrs: string, body: string): { sub: "idle" | "terminate" | "text"; from: string | null } {
  const from = /teammate_id="([^"]*)"/.exec(attrs)?.[1] ?? null;
  const type = /^\s*\{\s*"type"\s*:\s*"([^"]+)"/.exec(body)?.[1];
  if (type === "idle_notification") return { sub: "idle", from };
  if (type !== undefined && /shutdown|terminat/.test(type)) return { sub: "terminate", from };
  return { sub: "text", from };
}
