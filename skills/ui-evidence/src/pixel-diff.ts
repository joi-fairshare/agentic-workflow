// Deterministic pixel comparison against an approved baseline. This is the
// no-model gate in front of the visual critique: unchanged pixels never
// reach an image model.
import crypto from "node:crypto";
import fs from "node:fs";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export interface Box { x: number; y: number; w: number; h: number }

export interface DiffResult {
  changed: boolean;
  sizeMismatch: boolean;
  diffPixels: number;
  totalPixels: number;
  /** Fraction of pixels that differ, 0..1. */
  diffScore: number;
  /** Bounding box of differing pixels; null when none or sizes differ. */
  box: Box | null;
}

export interface DiffOptions {
  /** pixelmatch per-pixel colour tolerance (0..1). */
  pixelThreshold?: number;
  /** Fraction of differing pixels above which the image counts as changed. */
  maxDiffScore?: number;
}

export function sha256File(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function comparePngs(afterPath: string, baselinePath: string, diffOutPath: string, opts: DiffOptions = {}): DiffResult {
  const after = PNG.sync.read(fs.readFileSync(afterPath));
  const base = PNG.sync.read(fs.readFileSync(baselinePath));
  if (after.width !== base.width || after.height !== base.height) {
    return { changed: true, sizeMismatch: true, diffPixels: 0, totalPixels: after.width * after.height, diffScore: 1, box: null };
  }
  const { width, height } = after;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(after.data, base.data, diff.data, width, height, { threshold: opts.pixelThreshold ?? 0.1, diffMask: true });
  fs.writeFileSync(diffOutPath, PNG.sync.write(diff));

  let box: Box | null = null;
  if (diffPixels > 0) {
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (diff.data[(y * width + x) * 4 + 3] === 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }
  const totalPixels = width * height;
  const diffScore = diffPixels / totalPixels;
  return { changed: diffScore > (opts.maxDiffScore ?? 0), sizeMismatch: false, diffPixels, totalPixels, diffScore, box };
}

/** Crops a PNG to `box` grown by `pad`, clamped to the image. */
export function cropPng(srcPath: string, box: Box, outPath: string, pad = 24): string {
  const src = PNG.sync.read(fs.readFileSync(srcPath));
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const w = Math.min(src.width - x, box.w + 2 * pad);
  const h = Math.min(src.height - y, box.h + 2 * pad);
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(src, out, x, y, w, h, 0, 0);
  fs.writeFileSync(outPath, PNG.sync.write(out));
  return outPath;
}
