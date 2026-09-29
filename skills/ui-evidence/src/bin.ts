// Process entry point — excluded from unit coverage; all logic is in cli.ts.
import { main, realDeps } from "./cli.js";
import { runScript } from "./run-script.js";

process.exitCode = await main(process.argv.slice(2), realDeps(runScript));
