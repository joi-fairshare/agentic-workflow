// skills/ui-evidence/src/db-provenance.ts — spec F15: evidence stays entirely
// local unless the DB is seeded/scrubbed data only (RF-2). `query` is
// injected so this file never hardcodes a DB driver; the real caller (Task 4)
// supplies one backed by `docker exec postgres_container psql`.
//
// Which domains and which email pattern count as "seed data" are
// deployment-specific, so they come from config (UI_EVIDENCE_SEED_DOMAINS,
// UI_EVIDENCE_SEED_EMAIL_PATTERN — see SKILL.md). Nothing configured means
// the defaults below, which only match fictional example.com addresses —
// so an unconfigured install fails closed (provenance stays "unknown",
// evidence stays local) against any real database.
const DEFAULT_SEED_DOMAINS = ["example.com"];
const DEFAULT_SEED_EMAIL_PATTERN = "seed-admin-%@example.com";

function getAllowedDomains(): string[] {
  const raw = process.env.UI_EVIDENCE_SEED_DOMAINS;
  if (!raw || raw.trim() === "") return DEFAULT_SEED_DOMAINS;
  return raw
    .split(",")
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
}

function getSeedEmailPattern(): string {
  const raw = process.env.UI_EVIDENCE_SEED_EMAIL_PATTERN;
  return raw && raw.trim() !== "" ? raw : DEFAULT_SEED_EMAIL_PATTERN;
}

export interface ProvenanceResult {
  provenance: "seeded" | "unknown";
  reason: string;
}

export async function checkDbProvenance(query: (sql: string) => Promise<unknown[]>): Promise<ProvenanceResult> {
  try {
    const allowedDomains = getAllowedDomains();
    const seedPattern = getSeedEmailPattern();
    const seedRows = await query(`SELECT email FROM public.profile WHERE email LIKE '${seedPattern}'`);
    if (seedRows.length === 0) {
      return { provenance: "unknown", reason: "no seed row found in public.profile" };
    }

    const allRows = (await query("SELECT email FROM public.profile")) as Array<{ email: string }>;
    for (const row of allRows) {
      const domain = row.email.split("@")[1];
      if (domain === undefined || !allowedDomains.includes(domain)) {
        return { provenance: "unknown", reason: `a profile row's email domain ("${row.email}") doesn't look like a seed — this data may be real` };
      }
    }

    return { provenance: "seeded", reason: "seed row present, every profile email domain is an allowed seed domain" };
  } catch (err) {
    return { provenance: "unknown", reason: err instanceof Error ? err.message : String(err) };
  }
}
