import fs from "node:fs";
import path from "node:path";

import { analyzeProbe, readProbeDir, renderProbe } from "./analyze.js";

export function runProbe(stateDir: string): string {
  const dir = path.join(stateDir, "probe");
  const md = renderProbe(analyzeProbe(readProbeDir(dir)));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "findings.md"), md);
  return md;
}
