import { randomUUID } from "node:crypto";
import { runSubagent } from "./runAgent.js";
import { CODE_SCANNER_PROMPT } from "./prompts.js";
import type { AuditLog } from "../auditLog.js";
import type { RawFinding } from "../types.js";

const OUTPUT_SCHEMA = {
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
            properties: {
              path: { type: "string" },
              line: { type: "integer" },
            },
            required: ["path", "line"],
          },
        },
        required: ["title", "description", "file"],
      },
    },
  },
  required: ["findings"],
} as const;

interface ScannerOutput {
  findings: Array<{
    title: string;
    description: string;
    severity?: string;
    file: { path: string; line: number };
  }>;
}

export async function runCodeScanner(
  repoPath: string,
  auditLog: AuditLog,
): Promise<RawFinding[]> {
  const output = await runSubagent<ScannerOutput>({
    name: "Code Scanner",
    systemPrompt: CODE_SCANNER_PROMPT,
    userPrompt:
      "Scan this repository's source for the risk patterns in your instructions and report every real finding.",
    cwd: repoPath,
    tools: ["Read", "Glob", "Grep"],
    outputSchema: OUTPUT_SCHEMA,
    auditLog,
  });

  return output.findings.map((f) => ({
    id: randomUUID(),
    source: "code-scan" as const,
    title: f.title,
    description: f.description,
    severity: f.severity,
    file: f.file,
  }));
}
