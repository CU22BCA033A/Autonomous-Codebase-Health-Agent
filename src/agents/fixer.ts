import { runSubagent } from "./runAgent.js";
import { FIXER_PROMPT } from "./prompts.js";
import type { AuditLog } from "../auditLog.js";
import type { Case, FixPlan } from "../types.js";

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    branchName: { type: "string" },
    summary: { type: "string" },
    diffPreview: { type: "string" },
    testCommand: { type: "string" },
  },
  required: ["branchName", "summary", "diffPreview", "testCommand"],
} as const;

interface FixerOutput {
  branchName: string;
  summary: string;
  diffPreview: string;
  testCommand: string;
}

/**
 * Step 1 scope only: proposes a fix, touches nothing. Brief §10 reserves
 * "guardrails and the PR-opening path" (branch creation, running the real
 * test suite, opening a draft PR) for Step 2 as its own, more heavily
 * reviewed unit of work — this function deliberately stops short of that,
 * even for cases the Triage Judge marked auto-fix-eligible.
 *
 * Tool grants below give this subagent no write access at all (no Write,
 * Edit, or Bash) — belt-and-suspenders alongside the prompt instructing it
 * not to act, so a prompt-injection style finding can't talk it into
 * touching the repo.
 */
export async function runFixer(
  repoPath: string,
  triageCase: Case,
  auditLog: AuditLog,
): Promise<FixPlan> {
  const caseDescription = [
    `Title: ${triageCase.title}`,
    triageCase.package
      ? `Package: ${triageCase.package.name}@${triageCase.package.version} (${triageCase.package.ecosystem})` +
        (triageCase.package.fixedVersion ? `, fixed in ${triageCase.package.fixedVersion}` : "")
      : null,
    triageCase.file ? `Location: ${triageCase.file.path}:${triageCase.file.line}` : null,
    triageCase.suggestedFix ? `Triage Judge's suggested fix: ${triageCase.suggestedFix}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const output = await runSubagent<FixerOutput>({
    name: "Fixer",
    systemPrompt: FIXER_PROMPT,
    userPrompt: `Propose a fix for this auto-fix-eligible case:\n\n${caseDescription}`,
    cwd: repoPath,
    tools: ["Read", "Glob", "Grep"],
    outputSchema: OUTPUT_SCHEMA,
    auditLog,
  });

  return {
    caseId: triageCase.id,
    branchName: output.branchName,
    summary: output.summary,
    diffPreview: output.diffPreview,
    testCommand: output.testCommand,
    dryRun: true,
  };
}
