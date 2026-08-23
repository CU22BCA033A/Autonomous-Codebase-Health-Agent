import { randomUUID } from "node:crypto";
import { AuditLog } from "./auditLog.js";
import { runDependencyAuditor } from "./agents/dependencyAuditor.js";
import { runCodeScanner } from "./agents/codeScanner.js";
import { runTriageJudge } from "./agents/triageJudge.js";
import { runFixer } from "./agents/fixer.js";
import { MAX_AUTOFIX_PER_RUN, MAX_FINDINGS_PER_RUN } from "./config.js";
import type { Case, RawFinding, ScanRun } from "./types.js";

/**
 * The orchestrator is thin on purpose (brief §2): it dispatches to each
 * specialist in a fixed, deterministic order, collects results, and stops.
 * All of the judgment lives in the Triage Judge; all of the safety policy
 * lives in the caps below and in each subagent's least-privilege tool
 * grants — not in orchestration logic that could drift out of sync with
 * the rest of the pipeline.
 */
export async function runScan(repoPath: string): Promise<ScanRun> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const auditLog = new AuditLog();

  console.log(`\n=== Docket scan ${runId} ===`);
  console.log(`Repo: ${repoPath}\n`);

  console.log("--- Phase 1: Dependency Auditor ---");
  const dependencyFindings = await runDependencyAuditor(repoPath, auditLog);
  console.log(`${dependencyFindings.length} dependency finding(s).\n`);

  console.log("--- Phase 2: Code Scanner ---");
  const codeFindings = await runCodeScanner(repoPath, auditLog);
  console.log(`${codeFindings.length} code-scan finding(s).\n`);

  let allFindings: RawFinding[] = [...dependencyFindings, ...codeFindings];
  if (allFindings.length > MAX_FINDINGS_PER_RUN) {
    console.log(
      `Capping triage to the first ${MAX_FINDINGS_PER_RUN} of ${allFindings.length} findings this run ` +
        `(DOCKET_MAX_FINDINGS). The rest will be picked up on the next scheduled sweep.\n`,
    );
    allFindings = allFindings.slice(0, MAX_FINDINGS_PER_RUN);
  }

  console.log("--- Phase 3: Triage Judge ---");
  const cases: Case[] = [];
  for (const [i, finding] of allFindings.entries()) {
    console.log(`\n[${i + 1}/${allFindings.length}] Triaging: ${finding.title}`);
    try {
      const triaged = await runTriageJudge(repoPath, finding, auditLog);
      cases.push(triaged);
    } catch (err) {
      console.error(`  Triage failed, defaulting to needs-review: ${(err as Error).message}`);
      cases.push({
        id: finding.id,
        source: finding.source,
        advisoryId: finding.advisoryId,
        package: finding.package,
        file: finding.file,
        reachable: false,
        blastRadius: "high",
        confidence: "low",
        verdict: "needs-review",
        reasoning: [
          "Triage Judge failed to complete — defaulting to needs-review per the low-confidence rule " +
            "rather than guessing (brief §4).",
          `Error: ${(err as Error).message}`,
        ],
        detectedAt: new Date().toISOString(),
        title: finding.title,
      });
    }
  }
  console.log(`\n${cases.length} case(s) triaged.\n`);

  console.log("--- Phase 4: Fixer (proposal-only, brief §10 step 1 scope) ---");
  const eligible = cases.filter((c) => c.verdict === "auto-fixed");
  const capped = eligible.slice(0, MAX_AUTOFIX_PER_RUN);
  if (eligible.length > capped.length) {
    console.log(
      `${eligible.length} case(s) are auto-fix eligible; capping fix plans to ${MAX_AUTOFIX_PER_RUN} this run ` +
        `(DOCKET_MAX_AUTOFIX — §5's cap on auto-fix volume per run).`,
    );
  }
  const fixPlans = [];
  for (const c of capped) {
    console.log(`\nProposing fix for: ${c.title}`);
    try {
      fixPlans.push(await runFixer(repoPath, c, auditLog));
    } catch (err) {
      console.error(`  Fixer failed: ${(err as Error).message}`);
    }
  }
  console.log(`\n${fixPlans.length} fix plan(s) proposed (dry run — nothing written to the repo).\n`);

  await auditLog.writeTo(`docket-runs/${runId}`);

  return {
    id: runId,
    repoPath,
    startedAt,
    finishedAt: new Date().toISOString(),
    cases,
    fixPlans,
  };
}
