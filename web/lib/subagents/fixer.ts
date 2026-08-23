import { runAgentLoop, type ToolSpec } from "../agentLoop";
import { FIXER_PROMPT } from "../prompts";
import { toolListFiles, toolReadFile } from "../tools";
import type { Case, FixPlan } from "../types";

interface FixerOutput {
  branchName: string;
  summary: string;
  diffPreview: string;
  testCommand: string;
}

const SUBMIT_SCHEMA = {
  type: "object",
  properties: {
    branchName: { type: "string" },
    summary: { type: "string" },
    diffPreview: { type: "string" },
    testCommand: { type: "string" },
  },
  required: ["branchName", "summary", "diffPreview", "testCommand"],
};

/**
 * Proposal-only, same as the CLI's Fixer — no write tools granted at all,
 * matching brief §10's step-1 scope (real branch/test/PR execution is a
 * separate, later step). See src/agents/fixer.ts for the fuller rationale.
 */
export async function runFixer(repoDir: string, triageCase: Case): Promise<FixPlan> {
  const tools: Record<string, ToolSpec> = {
    read_file: {
      description: "Read a file's contents by path relative to the repo root.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      handler: async (args) => toolReadFile(repoDir, String(args.path)),
    },
    list_files: {
      description: "List files matching a glob pattern in the repo.",
      parameters: { type: "object", properties: { pattern: { type: "string" } }, required: ["pattern"] },
      handler: async (args) => toolListFiles(repoDir, String(args.pattern)),
    },
  };

  const caseDescription = [
    `Title: ${triageCase.title}`,
    triageCase.package
      ? `Package: ${triageCase.package.name}@${triageCase.package.version} (${triageCase.package.ecosystem})`
      : null,
    triageCase.file ? `Location: ${triageCase.file.path}:${triageCase.file.line}` : null,
    triageCase.suggestedFix ? `Suggested fix: ${triageCase.suggestedFix}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const output = await runAgentLoop<FixerOutput>({
    name: "Fixer",
    systemPrompt: FIXER_PROMPT,
    userPrompt: `Propose a fix for this auto-fix-eligible case:\n\n${caseDescription}`,
    tools,
    submitSchema: SUBMIT_SCHEMA,
    maxIterations: 4,
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
