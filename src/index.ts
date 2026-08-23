#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path, { resolve } from "node:path";
import { runScan } from "./orchestrator.js";
import { printReport } from "./report.js";

async function main(): Promise<void> {
  const repoArg = process.argv[2];
  if (!repoArg) {
    console.error("Usage: docket scan <path-to-repo>");
    console.error("  (headless, terminal-only — brief §10 step 1. No dashboard yet.)");
    process.exit(1);
  }

  const repoPath = resolve(repoArg);
  const run = await runScan(repoPath);
  printReport(run);

  const runDir = path.join("docket-runs", run.id);
  await mkdir(runDir, { recursive: true });
  const outFile = path.join(runDir, "cases.json");
  await writeFile(outFile, JSON.stringify(run, null, 2), "utf8");
  console.log(`Run artifact written to ${outFile}`);
}

main().catch((err) => {
  console.error("Docket run failed:", err);
  process.exit(1);
});
