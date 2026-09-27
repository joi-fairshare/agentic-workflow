import type { Db } from "./db.js";

export type PrState = "MERGED" | "OPEN" | "CLOSED" | "UNKNOWN";
export type PrStateLookup = (repo: string, number: number) => Promise<PrState>;
export type ExecFn = (cmd: string, args: string[]) => Promise<string>;

const RECHECK_MS = 6 * 60 * 60 * 1000;

export function makeGhLookup(exec: ExecFn): PrStateLookup {
  return async (repo, number) => {
    try {
      const out = (await exec("gh", ["pr", "view", String(number), "--repo", repo, "--json", "state", "-q", ".state"])).trim();
      return out === "MERGED" || out === "OPEN" || out === "CLOSED" ? out : "UNKNOWN";
    } catch {
      return "UNKNOWN";
    }
  };
}

export async function refreshPrStates(db: Db, lookup: PrStateLookup, now: Date): Promise<number> {
  const rows = db.prepare(`
    SELECT DISTINCT p.repo, p.number, s.state, s.checked_at AS checkedAt
    FROM pr_links p LEFT JOIN pr_state s ON s.repo = p.repo AND s.number = p.number`).all() as Array<{ repo: string; number: number; state: PrState | null; checkedAt: string | null }>;
  const due = rows.filter((r) => r.state === null || ((r.state === "OPEN" || r.state === "UNKNOWN") && now.getTime() - Date.parse(String(r.checkedAt)) >= RECHECK_MS));
  const upsert = db.prepare(`
    INSERT INTO pr_state (repo, number, state, checked_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (repo, number) DO UPDATE SET state = excluded.state, checked_at = excluded.checked_at`);
  for (const r of due) upsert.run(r.repo, r.number, await lookup(r.repo, r.number), now.toISOString());
  return due.length;
}
