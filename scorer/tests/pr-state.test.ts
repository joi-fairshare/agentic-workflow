import { beforeEach, describe, expect, it } from "vitest";

import type { Db } from "../src/db.js";
import type { PrState } from "../src/pr-state.js";
import { openDb } from "../src/db.js";
import { makeGhLookup, refreshPrStates } from "../src/pr-state.js";

let db: Db;
const NOW = new Date("2026-09-26T12:00:00.000Z");
const link = (n: number) => db.prepare("INSERT INTO pr_links VALUES ('f', 's', 'o/r', ?, '2026-09-26T00:00:00.000Z')").run(n);
const state = (n: number, s: PrState, checkedAt: string) => db.prepare("INSERT INTO pr_state VALUES ('o/r', ?, ?, ?)").run(n, s, checkedAt);

beforeEach(() => { db = openDb(":memory:"); });

describe("refreshPrStates", () => {
  it("looks up unknown PRs and stores the answer", async () => {
    link(1);
    const asked: number[] = [];
    const n = await refreshPrStates(db, async (_repo, num) => { asked.push(num); return "MERGED"; }, NOW);
    expect(n).toBe(1);
    expect(asked).toEqual([1]);
    expect(db.prepare("SELECT state, checked_at FROM pr_state").get()).toEqual({ state: "MERGED", checked_at: NOW.toISOString() });
  });

  it("never rechecks merged or closed PRs, and rechecks stale open ones", async () => {
    link(1); link(2); link(3); link(4);
    state(1, "MERGED", "2026-01-01T00:00:00.000Z");
    state(2, "CLOSED", "2026-01-01T00:00:00.000Z");
    state(3, "OPEN", "2026-09-26T00:00:00.000Z");
    state(4, "OPEN", "2026-09-26T11:00:00.000Z");
    const asked: number[] = [];
    await refreshPrStates(db, async (_r, num) => { asked.push(num); return "MERGED"; }, NOW);
    expect(asked).toEqual([3]);
  });

  it("rechecks a stale UNKNOWN", async () => {
    link(5);
    state(5, "UNKNOWN", "2026-09-25T00:00:00.000Z");
    expect(await refreshPrStates(db, async () => "OPEN", NOW)).toBe(1);
  });
});

describe("makeGhLookup", () => {
  it("asks gh for the state", async () => {
    const calls: string[][] = [];
    const lookup = makeGhLookup(async (cmd, args) => { calls.push([cmd, ...args]); return "MERGED\n"; });
    expect(await lookup("acme/web-app", 12)).toBe("MERGED");
    expect(calls).toEqual([["gh", "pr", "view", "12", "--repo", "acme/web-app", "--json", "state", "-q", ".state"]]);
  });

  it("maps unexpected output and failures to UNKNOWN", async () => {
    expect(await makeGhLookup(async () => "DRAFT")("o/r", 1)).toBe("UNKNOWN");
    expect(await makeGhLookup(async () => { throw new Error("no auth"); })("o/r", 1)).toBe("UNKNOWN");
  });

  it("passes OPEN and CLOSED through", async () => {
    expect(await makeGhLookup(async () => "OPEN")("o/r", 1)).toBe("OPEN");
    expect(await makeGhLookup(async () => "CLOSED")("o/r", 1)).toBe("CLOSED");
  });
});
