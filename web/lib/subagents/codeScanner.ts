import { randomUUID } from "node:crypto";
import { runAgentLoop, type ToolSpec } from "../agentLoop";
import { CODE_SCANNER_PROMPT } from "../prompts";
import { toolListFiles, toolReadFile } from "../tools";
import type { RawFinding } from "../types";

interface ScannerOutput {
  findings: Array<{
    title: string;
    description: string;
    severity?: string;
    file: { path: string; line: number };
  }>;
}

const SUBMIT_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          severity: { type: "string" },
          file: {
            type: "object",
            properties: { path: { type: "string" }, line: { type: "integer" } },
            required: ["path", "line"],
          },
        },
        required: ["title", "description", "file"],
      },
    },
  },
  required: ["findings"],
};

export async function runCodeScanner(repoDir: string): Promise<RawFinding[]> {
  const tools: Record<string, ToolSpec> = {
    list_files: {
      description: "List files matching a glob pattern in the repo, e.g. '**/*.js' or 'app/**/*.py'.",
      parameters: { type: "object", properties: { pattern: { type: "string" } }, required: ["pattern"] },
      handler: async (args) => toolListFiles(repoDir, String(args.pattern)),
    },
    read_file: {
      description: "Read a file's contents by path relative to the repo root.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      handler: async (args) => toolReadFile(repoDir, String(args.path)),
    },
  };

  const output = await runAgentLoop<ScannerOutput>({
    name: "Code Scanner",
    systemPrompt: CODE_SCANNER_PROMPT,
    userPrompt: "Scan this repo's source for the risk patterns in your instructions and report real findings only.",
    tools,
    submitSchema: SUBMIT_SCHEMA,
    maxIterations: 6,
  });

  return (output.findings ?? []).map((f) => ({
    id: randomUUID(),
    source: "code-scan" as const,
    title: f.title,
    description: f.description,
    severity: f.severity,
    file: f.file,
  }));
}
