import { randomUUID } from "node:crypto";
import { runAgentLoop, type ToolSpec } from "../agentLoop";
import { DEPENDENCY_AUDITOR_PROMPT } from "../prompts";
import { toolListFiles, toolReadFile } from "../tools";
import { osvScan, fixedVersionFor, highestSeverity } from "../osv";
import type { RawFinding } from "../types";

interface AuditorOutput {
  findings: Array<{
    title: string;
    description: string;
    advisoryId?: string;
    severity?: string;
    package: { name: string; ecosystem: string; version: string; fixedVersion?: string };
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
        },
        required: ["title", "description", "package"],
      },
    },
  },
  required: ["findings"],
};

export async function runDependencyAuditor(repoDir: string): Promise<RawFinding[]> {
  const tools: Record<string, ToolSpec> = {
    list_files: {
      description: "List files matching a glob pattern in the repo, e.g. '*.json' or '**/package.json'.",
      parameters: { type: "object", properties: { pattern: { type: "string" } }, required: ["pattern"] },
      handler: async (args) => toolListFiles(repoDir, String(args.pattern)),
    },
    read_file: {
      description: "Read a file's contents by path relative to the repo root.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      handler: async (args) => toolReadFile(repoDir, String(args.path)),
    },
    osv_scan: {
      description: "Check a list of packages against OSV.dev for known vulnerabilities. Pass name/ecosystem/version for each.",
      parameters: {
        type: "object",
        properties: {
          packages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                ecosystem: { type: "string", description: "npm, PyPI, Go, crates.io, RubyGems, Packagist, etc." },
                version: { type: "string" },
              },
              required: ["name", "ecosystem", "version"],
            },
          },
        },
        required: ["packages"],
      },
      handler: async (args) => {
        const packages = args.packages as Array<{ name: string; ecosystem: string; version: string }>;
        try {
          const results = await osvScan(packages);
          const flagged = results
            .filter((r) => r.vulnerabilities.length > 0)
            .map((r) => ({
              name: r.name,
              ecosystem: r.ecosystem,
              version: r.version,
              vulnerabilities: r.vulnerabilities.map((v) => ({
                id: v.id,
                summary: v.summary,
                severity: highestSeverity(v),
                fixedVersion: fixedVersionFor(v, r.ecosystem),
              })),
            }));
          return JSON.stringify({ queried: packages.length, flagged: flagged.length, results: flagged });
        } catch (err) {
          return `osv_scan failed: ${(err as Error).message}. Report zero findings rather than guessing.`;
        }
      },
    },
  };

  const output = await runAgentLoop<AuditorOutput>({
    name: "Dependency Auditor",
    systemPrompt: DEPENDENCY_AUDITOR_PROMPT,
    userPrompt: "Audit this repo's direct dependencies against OSV.dev and report every flagged package.",
    tools,
    submitSchema: SUBMIT_SCHEMA,
    maxIterations: 5,
  });

  return (output.findings ?? []).map((f) => ({
    id: randomUUID(),
    source: "dependency" as const,
    title: f.title,
    description: f.description,
    advisoryId: f.advisoryId,
    severity: f.severity,
    package: f.package,
  }));
}
