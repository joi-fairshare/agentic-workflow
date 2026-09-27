import { afterEach, describe, expect, it } from "vitest";

import { checkDbProvenance } from "../src/db-provenance.js";

describe("checkDbProvenance", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("uses configured UI_EVIDENCE_SEED_DOMAINS and UI_EVIDENCE_SEED_EMAIL_PATTERN, not the defaults", async () => {
    process.env.UI_EVIDENCE_SEED_DOMAINS = "test.internal, other.test";
    process.env.UI_EVIDENCE_SEED_EMAIL_PATTERN = "qa-seed-%@test.internal";
    const query = async (sql: string) => {
      if (sql.includes("qa-seed")) return [{ email: "qa-seed-1@test.internal" }];
      if (sql.includes("profile")) return [{ email: "qa-seed-1@test.internal" }, { email: "someone@other.test" }];
      return [];
    };
    expect(await checkDbProvenance(query)).toMatchObject({ provenance: "seeded" });
  });

  it("treats a blank UI_EVIDENCE_SEED_DOMAINS as unconfigured (falls back to the default)", async () => {
    process.env.UI_EVIDENCE_SEED_DOMAINS = "   ";
    process.env.UI_EVIDENCE_SEED_EMAIL_PATTERN = "   ";
    const query = async (sql: string) => {
      if (sql.includes("seed-admin")) return [{ email: "seed-admin-1@example.com" }];
      if (sql.includes("profile")) return [{ email: "seed-admin-1@example.com" }];
      return [];
    };
    expect(await checkDbProvenance(query)).toMatchObject({ provenance: "seeded" });
  });

  it("is seeded when a seed row exists and every email looks synthetic", async () => {
    const query = async (sql: string) => {
      if (sql.includes("seed-admin")) return [{ email: "seed-admin-42@example.com" }];
      if (sql.includes("profile")) return [{ email: "seed-admin-42@example.com" }, { email: "manager-42@example.com" }];
      return [];
    };
    expect(await checkDbProvenance(query)).toMatchObject({ provenance: "seeded" });
  });

  it("is unknown when no seed row exists (RF-2)", async () => {
    const query = async () => [];
    const result = await checkDbProvenance(query);
    expect(result.provenance).toBe("unknown");
    expect(result.reason).toMatch(/seed/i);
  });

  it("is unknown when a profile row's email domain looks like a real person's, not a seed (RF-2)", async () => {
    const query = async (sql: string) => {
      if (sql.includes("seed-admin")) return [{ email: "seed-admin-42@example.com" }];
      if (sql.includes("profile")) return [{ email: "seed-admin-42@example.com" }, { email: "real.person@gmail.com" }];
      return [];
    };
    const result = await checkDbProvenance(query);
    expect(result.provenance).toBe("unknown");
    expect(result.reason).toMatch(/domain|real/i);
  });

  it("is unknown when a profile row's email has no @ at all", async () => {
    const query = async (sql: string) => {
      if (sql.includes("seed-admin")) return [{ email: "seed-admin-42@example.com" }];
      if (sql.includes("profile")) return [{ email: "seed-admin-42@example.com" }, { email: "not-an-email" }];
      return [];
    };
    const result = await checkDbProvenance(query);
    expect(result.provenance).toBe("unknown");
  });

  it("is unknown, not a throw, when the query itself fails", async () => {
    const query = async () => {
      throw new Error("connection refused");
    };
    const result = await checkDbProvenance(query);
    expect(result.provenance).toBe("unknown");
    expect(result.reason).toMatch(/connection refused/);
  });

  it("is unknown, not a throw, when the query rejects with a non-Error value", async () => {
    const query = async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw "plain string failure";
    };
    const result = await checkDbProvenance(query);
    expect(result.provenance).toBe("unknown");
    expect(result.reason).toBe("plain string failure");
  });
});
