import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PNG } from "pngjs";
import { afterAll, describe, expect, it } from "vitest";

import { comparePngs, cropPng, sha256File } from "../src/pixel-diff.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pixel-diff-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

function png(name: string, w: number, h: number, paint?: (set: (x: number, y: number) => void) => void): string {
  const img = new PNG({ width: w, height: h });
  img.data.fill(255);
  paint?.((x, y) => { const i = (y * w + x) * 4; img.data[i] = 0; img.data[i + 1] = 0; img.data[i + 2] = 0; });
  const file = path.join(dir, name);
  fs.writeFileSync(file, PNG.sync.write(img));
  return file;
}

describe("comparePngs", () => {
  it("reports identical images as unchanged with a zero score and no box", () => {
    const r = comparePngs(png("a.png", 20, 20), png("b.png", 20, 20), path.join(dir, "d.png"));
    expect(r).toMatchObject({ changed: false, diffScore: 0, box: null, sizeMismatch: false });
  });
  it("reports a changed region with its bounding box", () => {
    const after = png("c.png", 20, 20, (set) => { for (let x = 5; x < 9; x++) for (let y = 6; y < 8; y++) set(x, y); });
    const r = comparePngs(after, png("e.png", 20, 20), path.join(dir, "d2.png"));
    expect(r.changed).toBe(true);
    expect(r.box).toEqual({ x: 5, y: 6, w: 4, h: 2 });
    expect(r.diffScore).toBeCloseTo(8 / 400);
  });
  it("tolerates a diff below maxDiffScore", () => {
    const after = png("f.png", 20, 20, (set) => set(1, 1));
    const r = comparePngs(after, png("g.png", 20, 20), path.join(dir, "d3.png"), { maxDiffScore: 0.01 });
    expect(r.changed).toBe(false);
    expect(r.diffPixels).toBe(1);
  });
  it("treats a size mismatch as changed with no box", () => {
    const r = comparePngs(png("h.png", 20, 20), png("i.png", 30, 20), path.join(dir, "d4.png"));
    expect(r).toMatchObject({ changed: true, sizeMismatch: true, box: null, diffScore: 1 });
  });
});

describe("cropPng / sha256File", () => {
  it("crops to the padded box, clamped to the image", () => {
    const out = cropPng(png("j.png", 100, 100), { x: 10, y: 10, w: 10, h: 10 }, path.join(dir, "crop.png"), 5);
    const c = PNG.sync.read(fs.readFileSync(out));
    expect([c.width, c.height]).toEqual([20, 20]);
    const edge = PNG.sync.read(fs.readFileSync(cropPng(png("k.png", 30, 30), { x: 0, y: 0, w: 10, h: 10 }, path.join(dir, "crop2.png"))));
    expect([edge.width, edge.height]).toEqual([30, 30]);
  });
  it("hashes file contents deterministically", () => {
    expect(sha256File(png("l.png", 4, 4))).toBe(sha256File(png("m.png", 4, 4)));
    expect(sha256File(png("l.png", 4, 4))).not.toBe(sha256File(png("n.png", 5, 4)));
  });
});
