import { randomUUID } from "node:crypto";
import { runSubagent } from "./runAgent.js";
import { DEPENDENCY_AUDITOR_PROMPT } from "./prompts.js";
import { docketMcpServer } from "../tools/osvTool.js";
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
          advisoryId: { type: "string" },
          severity: { type: "string" },
          package: {
            type: "object",
            properties: {
              name: { type: "string" },
              ecosystem: { type: "string" },
              version: { type: "string" },
              fixedVersion: { type: "string" },
            },
            required: ["name", "ecosystem", "version"],
          },
          references: { type: "array", items: { type: "string" } },
        },
        required: ["title", "description", "package"],
      },
    },
  },
  required: ["findings"],
} as const;

interface AuditorOutput {
  findings: Array<{
    title: string;
    description: string;
    advisoryId?: string;
    severity?: string;
    package: {
      name: string;
      ecosystem: string;
      version: string;
      fixedVersion?: string;
    };
    references?: string[];
  }>;
}

export async function runDependencyAuditor(
  repoPath: string,
  auditLog: AuditLog,
): Promise<RawFinding[]> {
  const output = await runSubagent<AuditorOutput>({
    name: "Dependency Auditor",
    systemPrompt: DEPENDENCY_AUDITOR_PROMPT,
    userPrompt:
      "Audit every dependency in this repository against OSV.dev and report every flagged package.",
    cwd: repoPath,
    tools: ["Read", "Glob", "Grep", "mcp__docket__osv_scan"],
    mcpServers: { docket: docketMcpServer },
    outputSchema: OUTPUT_SCHEMA,
    auditLog,
  });

  return output.findings.map((f) => ({
    id: randomUUID(),
    source: "dependency" as const,
    title: f.title,
    description: f.description,
    advisoryId: f.advisoryId,
    severity: f.severity,
    package: f.package,
    references: f.references,
  }));
}
