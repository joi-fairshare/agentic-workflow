// Runs the `judge` CLI with JSON on stdin. Async execFile silently ignores an
// `input` option (only the *Sync variants honour it), and `judge` reads stdin
// to EOF — so every call has to write and close stdin itself.
import { spawn } from "node:child_process";

export interface JudgeResult {
  stdout: string;
  code: number | null;
}

export function runJudge(args: string[], input: string, timeoutMs: number): Promise<JudgeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("judge", args, { stdio: ["pipe", "pipe", "ignore"] });
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`judge ${args.join(" ")} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d: string) => { stdout += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ stdout, code }); });
    child.stdin.on("error", () => undefined); // judge exiting early is reported via close
    child.stdin.end(input);
  });
}
