import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

export interface ProbeLine {
  ts: string;
  event: string;
  input: Record<string, unknown> | null;
}

export type Answer = { verdict: "observed" | "not-observed" | "no-data"; evidence: string };

export interface ProbeFindings {
  counts: Record<string, number>;
  keySets: Record<string, Record<string, number>>;
  deliveredPromptsReachUserPromptSubmit: Answer;
  subagentHooksCarryAgentId: Answer;
  subagentHooksSeeParentSession: Answer;
  subagentStopFires: Answer;
  toolUseIdMatches: Answer;
}

const ProbeLineSchema = z.object({ ts: z.string(), event: z.string(), input: z.record(z.unknown()).nullable() });
const DELIVERED = /^(?:Another Claude session sent a message|<teammate-message\b)/;

export function readProbeDir(dir: string): ProbeLine[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).flatMap((f) =>
    fs.readFileSync(path.join(dir, f), "utf8").split("\n").flatMap((line) => {
      try {
        const parsed = ProbeLineSchema.safeParse(JSON.parse(line));
        return parsed.success ? [parsed.data] : [];
      } catch {
        return [];
      }
    }),
  );
}

const str = (l: ProbeLine, key: string): string | undefined => {
  const v = l.input?.[key];
  return typeof v === "string" ? v : undefined;
};

function answer(total: number, hits: number, evidence: string): Answer {
  return { verdict: total === 0 ? "no-data" : hits > 0 ? "observed" : "not-observed", evidence };
}

export function analyzeProbe(lines: ProbeLine[]): ProbeFindings {
  const counts: Record<string, number> = {};
  const keySets: Record<string, Record<string, number>> = {};
  for (const l of lines) {
    counts[l.event] = (counts[l.event] ?? 0) + 1;
    const keys = l.input === null ? "(null)" : Object.keys(l.input).sort().join(",");
    keySets[l.event] = { ...keySets[l.event], [keys]: (keySets[l.event]?.[keys] ?? 0) + 1 };
  }
  const of = (event: string) => lines.filter((l) => l.event === event);

  const ups = of("UserPromptSubmit");
  const delivered = ups.filter((l) => DELIVERED.test(str(l, "prompt") ?? "")).length;

  const toolEvents = [...of("PreToolUse"), ...of("PostToolUse")];
  const withAgent = toolEvents.filter((l) => str(l, "agent_id") !== undefined);
  const mainSessions = new Set([...ups, ...toolEvents.filter((l) => str(l, "agent_id") === undefined)].map((l) => str(l, "session_id")));
  const seeParent = withAgent.filter((l) => mainSessions.has(str(l, "session_id"))).length;

  const stops = of("Stop");
  const subStops = of("SubagentStop").length;
  const stopsWithAgent = stops.filter((l) => str(l, "agent_id") !== undefined).length;

  const pre = of("PreToolUse").map((l) => str(l, "tool_use_id")).filter((id): id is string => id !== undefined);
  const post = new Set(of("PostToolUse").map((l) => str(l, "tool_use_id")));
  const matched = pre.filter((id) => post.has(id)).length;

  return {
    counts,
    keySets,
    deliveredPromptsReachUserPromptSubmit: answer(ups.length, delivered, `${delivered} of ${ups.length} UserPromptSubmit inputs were delivered messages`),
    subagentHooksCarryAgentId: answer(toolEvents.length, withAgent.length, `${withAgent.length} of ${toolEvents.length} tool-hook inputs carried agent_id`),
    subagentHooksSeeParentSession: answer(withAgent.length, seeParent, `${seeParent} of ${withAgent.length} agent_id inputs used a main session's session_id`),
    subagentStopFires: answer(stops.length + subStops, stopsWithAgent, `${stopsWithAgent} Stop inputs carried agent_id; ${subStops} SubagentStop inputs`),
    toolUseIdMatches: answer(pre.length, matched, `${matched} of ${pre.length} PreToolUse ids had a matching PostToolUse`),
  };
}

export function renderProbe(f: ProbeFindings): string {
  const rows: Array<[string, Answer]> = [
    ["1. UserPromptSubmit fires for delivered messages", f.deliveredPromptsReachUserPromptSubmit],
    ["2a. Subagent tool hooks carry agent_id", f.subagentHooksCarryAgentId],
    ["2b. Subagent hooks see the parent's session_id", f.subagentHooksSeeParentSession],
    ["3. A subagent's Stop fires", f.subagentStopFires],
    ["4. tool_use_id matches between PreToolUse and PostToolUse", f.toolUseIdMatches],
  ];
  return [
    "# Hook-input probe findings", "",
    "| Question | Verdict | Evidence |", "|---|---|---|",
    ...rows.map(([q, a]) => `| ${q} | ${a.verdict} | ${a.evidence} |`),
    "", "## Events", "", "| Event | Inputs |", "|---|---|",
    ...Object.entries(f.counts).map(([e, n]) => `| ${e} | ${n} |`),
    "", "## Field names per event (values are never shown)", "",
    ...Object.entries(f.keySets).flatMap(([e, sets]) => [`### ${e}`, ...Object.entries(sets).map(([k, n]) => `- \`${k}\` ×${n}`), ""]),
  ].join("\n");
}
