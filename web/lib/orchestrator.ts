import { randomUUID } from "node:crypto";
import { fetchRepo, parseRepoInput } from "./repoFetch";
import { runDependencyAuditor } from "./subagents/dependencyAuditor";
import { runCodeScanner } from "./subagents/codeScanner";
import { runTriageJudge } from "./subagents/triageJudge";
import { runFixer } from "./subagents/fixer";
import { MAX_AUTOFIX_PER_RUN, MAX_FINDINGS_PER_RUN } from "./config";
import type { Case, RawFinding, ScanRun } from "./types";

/**
 * Same shape as the CLI's orchestrator.ts (thin dispatch, deterministic
 * caps) but adapted for one bounded HTTP request/response instead of a
 * long-running terminal process: fetches the repo fresh (no persistent
 * disk between requests), runs every phase with a per-finding try/catch so
 * one bad Groq call degrades to a safe default instead of failing the
 * whole scan, and always cleans up the extracted tarball.
 */
export async function runScan(repoInput: string): Promise<ScanRun> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const warnings: string[] = [];

  const { owner, repo, ref } = parseRepoInput(repoInput);
  const fetched = await fetchRepo(owner, repo, ref);

  try {
    let dependencyFindings: RawFinding[] = [];
    try {
      dependencyFindings = await runDependencyAuditor(fetched.dir);
    } catch (err) {
      warnings.push(`Dependency Auditor failed: ${(err as Error).message}`);
    }

    let codeFindings: RawFinding[] = [];
    try {
      codeFindings = await runCodeScanner(fetched.dir);
    } catch (err) {
      warnings.push(`Code Scanner failed: ${(err as Error).message}`);
    }

    let allFindings: RawFinding[] = [...dependencyFindings, ...codeFindings];
    if (allFindings.length > MAX_FINDINGS_PER_RUN) {
      warnings.push(
        `Capping triage to ${MAX_FINDINGS_PER_RUN} of ${allFindings.length} findings (free-tier budget). ` +
          `Increase DOCKET_MAX_FINDINGS if you have headroom.`,
      );
      allFindings = allFindings.slice(0, MAX_FINDINGS_PER_RUN);
    }

    const cases: Case[] = [];
    for (const finding of allFindings) {
      try {
        cases.push(await runTriageJudge(fetched.dir, finding));
      } catch (err) {
        warnings.push(`Triage failed for "${finding.title}": ${(err as Error).message} — defaulting to needs-review.`);
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
            "Triage Judge failed to complete — defaulting to needs-review per the low-confidence rule rather than guessing.",
            `Error: ${(err as Error).message}`,
          ],
          detectedAt: new Date().toISOString(),
          title: finding.title,
        });
      }
    }

    const eligible = cases.filter((c) => c.verdict === "auto-fixed");
    const capped = eligible.slice(0, MAX_AUTOFIX_PER_RUN);
    const fixPlans = [];
    for (const c of capped) {
      try {
        fixPlans.push(await runFixer(fetched.dir, c));
      } catch (err) {
        warnings.push(`Fixer failed for "${c.title}": ${(err as Error).message}`);
      }
    }

    return {
      id: runId,
      repo: `${owner}/${repo}@${fetched.ref}`,
      startedAt,
      finishedAt: new Date().toISOString(),
      cases,
      fixPlans,
      warnings,
    };
  } finally {
    await fetched.cleanup();
  }
}
