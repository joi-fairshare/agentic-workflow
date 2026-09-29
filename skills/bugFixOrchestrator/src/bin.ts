#!/usr/bin/env node
import { main } from "./cli.js";
import { realDeps } from "./deps.js";

const result = main(process.argv.slice(2), realDeps());
if (result.stdout) process.stdout.write(result.stdout + "\n");
if (result.stderr) process.stderr.write(result.stderr + "\n");
process.exit(result.exitCode);
