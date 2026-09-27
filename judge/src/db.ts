import Database from "better-sqlite3";

export type Db = Database.Database;

export const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  question TEXT NOT NULL,
  content_class TEXT NOT NULL,
  provider TEXT NOT NULL,
  decision TEXT,
  confidence REAL NOT NULL,
  reason_code TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  input_digest TEXT NOT NULL,
  undone_at TEXT,
  chain_position INTEGER NOT NULL DEFAULT 0,
  skipped TEXT NOT NULL DEFAULT '[]',
  outcome TEXT NOT NULL DEFAULT 'decided'
);
CREATE INDEX IF NOT EXISTS decisions_ts ON decisions(ts);
CREATE INDEX IF NOT EXISTS decisions_question_ts ON decisions(question, ts);
CREATE TABLE IF NOT EXISTS failures (
  ts TEXT NOT NULL,
  question TEXT NOT NULL,
  provider TEXT NOT NULL,
  reason_code TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS failures_ts ON failures(ts);
CREATE TABLE IF NOT EXISTS briefs (
  tool_use_id TEXT PRIMARY KEY,
  agent_id TEXT,
  session_id TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  dispatch_name TEXT,
  subagent_type TEXT NOT NULL,
  goal TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  proof_command TEXT NOT NULL,
  saved_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS briefs_agent_id ON briefs(agent_id);
CREATE INDEX IF NOT EXISTS briefs_dispatch_name ON briefs(dispatch_name, agent_id, saved_at);
CREATE INDEX IF NOT EXISTS briefs_dispatch_lookup ON briefs(session_id, prompt_id, subagent_type, agent_id, saved_at);
`;

export interface BriefRow {
  toolUseId: string;
  agentId: string | null;
  sessionId: string;
  promptId: string;
  dispatchName: string | null;
  subagentType: string;
  goal: string;
  acceptanceCriteria: string;
  proofCommand: string;
  savedAt: string;
}

interface BriefDbRow {
  tool_use_id: string;
  agent_id: string | null;
  session_id: string;
  prompt_id: string;
  dispatch_name: string | null;
  subagent_type: string;
  goal: string;
  acceptance_criteria: string;
  proof_command: string;
  saved_at: string;
}

function rowToBrief(row: BriefDbRow): BriefRow {
  return {
    toolUseId: row.tool_use_id, agentId: row.agent_id, sessionId: row.session_id, promptId: row.prompt_id,
    dispatchName: row.dispatch_name, subagentType: row.subagent_type, goal: row.goal,
    acceptanceCriteria: row.acceptance_criteria, proofCommand: row.proof_command, savedAt: row.saved_at,
  };
}

export function saveBrief(db: Db, row: Omit<BriefRow, "agentId">): void {
  db.prepare(
    `INSERT INTO briefs (tool_use_id, agent_id, session_id, prompt_id, dispatch_name, subagent_type, goal, acceptance_criteria, proof_command, saved_at)
     VALUES (@toolUseId, NULL, @sessionId, @promptId, @dispatchName, @subagentType, @goal, @acceptanceCriteria, @proofCommand, @savedAt)`,
  ).run(row);
}

export function mapToolUseIdToAgentId(db: Db, toolUseId: string, agentId: string): void {
  db.prepare("UPDATE briefs SET agent_id = ? WHERE tool_use_id = ?").run(agentId, toolUseId);
}

export function getBriefByToolUseId(db: Db, toolUseId: string): BriefRow | undefined {
  const row = db.prepare("SELECT * FROM briefs WHERE tool_use_id = ?").get(toolUseId) as BriefDbRow | undefined;
  return row === undefined ? undefined : rowToBrief(row);
}

export function getBriefByAgentId(db: Db, agentId: string): BriefRow | undefined {
  const row = db.prepare("SELECT * FROM briefs WHERE agent_id = ?").get(agentId) as BriefDbRow | undefined;
  return row === undefined ? undefined : rowToBrief(row);
}

export function findUnmappedBriefByTeammateName(db: Db, name: string): BriefRow | undefined {
  const row = db
    .prepare("SELECT * FROM briefs WHERE dispatch_name = ? AND agent_id IS NULL ORDER BY saved_at ASC LIMIT 1")
    .get(name) as BriefDbRow | undefined;
  return row === undefined ? undefined : rowToBrief(row);
}

export function findUnmappedBriefBySubagentDispatch(db: Db, sessionId: string, promptId: string, subagentType: string): BriefRow | undefined {
  const row = db
    .prepare("SELECT * FROM briefs WHERE session_id = ? AND prompt_id = ? AND subagent_type = ? AND agent_id IS NULL ORDER BY saved_at ASC LIMIT 1")
    .get(sessionId, promptId, subagentType) as BriefDbRow | undefined;
  return row === undefined ? undefined : rowToBrief(row);
}

export interface SkippedProvider {
  provider: string;
  reason: "unavailable" | "failed" | "timeout" | "below_threshold";
}

export type DecisionOutcome = "decided" | "escalated" | "failed";

export interface DecisionRow {
  id: string;
  ts: string;
  question: string;
  content_class: string;
  provider: string;
  decision: string | null;
  confidence: number;
  reason_code: string;
  latency_ms: number;
  input_digest: string;
  undone_at: string | null;
  chain_position: number;
  skipped: SkippedProvider[];
  outcome: DecisionOutcome;
}

export interface FailureRow {
  ts: string;
  question: string;
  provider: string;
  reason_code: string;
}

export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 2000");
  db.exec(MIGRATIONS);
  return db;
}

export function recordDecision(db: Db, row: DecisionRow): void {
  db.prepare(
    `INSERT INTO decisions (id, ts, question, content_class, provider, decision, confidence, reason_code, latency_ms, input_digest, undone_at, chain_position, skipped, outcome)
     VALUES (@id, @ts, @question, @content_class, @provider, @decision, @confidence, @reason_code, @latency_ms, @input_digest, @undone_at, @chain_position, @skipped, @outcome)`,
  ).run({ ...row, skipped: JSON.stringify(row.skipped) });
}

export function recordFailure(db: Db, row: FailureRow): void {
  db.prepare(`INSERT INTO failures (ts, question, provider, reason_code) VALUES (@ts, @question, @provider, @reason_code)`).run(row);
}

export function getDecision(db: Db, id: string): DecisionRow | undefined {
  const row = db.prepare("SELECT * FROM decisions WHERE id = ?").get(id) as (Omit<DecisionRow, "skipped"> & { skipped: string }) | undefined;
  if (row === undefined) return undefined;
  return { ...row, skipped: JSON.parse(row.skipped) as SkippedProvider[] };
}

export function recordUndo(db: Db, id: string, at: string): void {
  db.prepare("UPDATE decisions SET undone_at = ? WHERE id = ?").run(at, id);
}
