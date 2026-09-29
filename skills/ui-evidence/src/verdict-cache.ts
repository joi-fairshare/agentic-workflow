// Verdict cache, not reality cache: only the image-judge's *opinion* is
// reused, keyed on the hashes of the actual after/baseline pixels plus every
// context that could change the meaning of that opinion. The browser run and
// every deterministic step check always execute; nothing here can turn a
// behavior failure into a pass.
import crypto from "node:crypto";
import fs from "node:fs";

export interface CacheContext {
  promptVersion: string;
  model: string;
  /** App build identity (commit SHA / build id); null when unknown. */
  appBuild: string | null;
  /** Hash of the executed script (route, role, steps, viewports). */
  scenario: string;
  /** Fixture / seed identity; null when unknown. */
  fixtures: string | null;
  viewport: string;
  browserVersion: string;
}

export interface CachedVerdict {
  decision: "looks-right" | "looks-off" | "sloppy";
  reasons: string[];
}

interface Entry extends CachedVerdict {
  runId: string;
}

export type Manifest = Record<string, Entry>;

export function hashJson(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function cacheKey(afterHash: string, baselineHash: string | null, ctx: CacheContext): string {
  return hashJson({ afterHash, baselineHash, ...ctx });
}

export function loadManifest(file: string): Manifest {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Manifest) : {};
  } catch {
    return {};
  }
}

export function saveManifest(file: string, manifest: Manifest): void {
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
}

/**
 * A hit needs the identical key. With an unknown app build, an entry is only
 * trusted inside the run that wrote it (pixels alone can hide a new build).
 */
export function lookup(manifest: Manifest, key: string, ctx: CacheContext, runId: string): CachedVerdict | null {
  const entry = manifest[key];
  if (entry === undefined) return null;
  if (ctx.appBuild === null && entry.runId !== runId) return null;
  return { decision: entry.decision, reasons: entry.reasons };
}

export function store(manifest: Manifest, key: string, verdict: CachedVerdict, runId: string): void {
  manifest[key] = { ...verdict, runId };
}
