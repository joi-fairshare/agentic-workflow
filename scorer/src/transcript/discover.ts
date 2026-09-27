import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

export interface TranscriptFile {
  path: string;
  project: string;
  sessionId: string;
  agentId: string;
  agentType: string;
  isMain: boolean;
}

const MetaSchema = z.object({ agentType: z.string(), taskKind: z.string().optional() });
const SUBAGENT = /^agent-(.+)\.jsonl$/;

export function discoverFiles(projectsDir: string): TranscriptFile[] {
  const out: TranscriptFile[] = [];
  for (const project of dirs(projectsDir)) {
    const projDir = path.join(projectsDir, project);
    for (const entry of fs.readdirSync(projDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        const sessionId = entry.name.slice(0, -".jsonl".length);
        out.push({ path: path.join(projDir, entry.name), project, sessionId, agentId: "main", agentType: "main", isMain: true });
      }
      if (entry.isDirectory()) out.push(...subagents(projDir, project, entry.name));
    }
  }
  return out;
}

function dirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
}

function subagents(projDir: string, project: string, sessionId: string): TranscriptFile[] {
  const subDir = path.join(projDir, sessionId, "subagents");
  if (!fs.existsSync(subDir)) return [];
  return fs.readdirSync(subDir).flatMap((name) => {
    const agentId = SUBAGENT.exec(name)?.[1];
    if (agentId === undefined) return [];
    return [{ path: path.join(subDir, name), project, sessionId, agentId, agentType: agentType(path.join(subDir, `agent-${agentId}.meta.json`)), isMain: false }];
  });
}

function agentType(metaPath: string): string {
  try {
    const meta = MetaSchema.safeParse(JSON.parse(fs.readFileSync(metaPath, "utf8")));
    if (!meta.success) return "unknown";
    // A teammate (in-process) subagent's meta carries its unique name as agentType,
    // which would otherwise create one one-off row per teammate in reports.
    return meta.data.taskKind === "in_process_teammate" ? "teammate" : meta.data.agentType;
  } catch {
    return "unknown";
  }
}
