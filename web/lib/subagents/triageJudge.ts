import { runAgentLoop, type ToolSpec } from "../agentLoop";
import { TRIAGE_JUDGE_PROMPT } from "../prompts";
import { toolGrep, toolReadFile } from "../tools";
import type { BlastRadius, Case, Confidence, RawFinding, Verdict } from "../types";

interface TriageOutput {
  reachable: boolean;
  reachabilityEvidence: string;
  blastRadius: BlastRadius;
  blastRadiusReason: string;
  safeFixAvailable: boolean;
  safeFixReason: string;
  confidence: Confidence;
  confidenceReason: string;
  suggestedFix?: string;
}

const SUBMIT_SCHEMA = {
  type: "object",
  properties: {
    reachable: { type: "boolean" },
    reachabilityEvidence: { type: "string" },
    blastRadius: { type: "string", enum: ["low", "high"] },
    blastRadiusReason: { type: "string" },
    safeFixAvailable: { type: "boolean" },
    safeFixReason: { type: "string" },
    confidence: { type: "string", enum: ["high", "low"] },
    confidenceReason: { type: "string" },
    suggestedFix: { type: "string" },
  },
  required: [
    "reachable",
    "reachabilityEvidence",
    "blastRadius",
    "blastRadiusReason",
    "safeFixAvailable",
    "safeFixReason",
    "confidence",
    "confidenceReason",
  ],
};

/**
 * Same deterministic decision matrix as src/agents/triageJudge.ts
 * (brief §4/§5) — ported unchanged. This is the one piece of logic in the
 * whole pipeline that must not vary between the Claude version and the
 * free Groq version: the guardrail that a high blast radius always routes
 * to a human, regardless of what the model concludes about fix safety.
 */
export function computeVerdict(a: {
  reachable: boolean;
  blastRadius: BlastRadius;
  safeFixAvailable: boolean;
  confidence: Confidence;
}): Verdict {
  if (a.confidence === "low") return "needs-review";
  if (!a.reachable) return "low-priority";
  if (a.blastRadius === "high") return "needs-review";
  if (a.safeFixAvailable) return "auto-fixed";
  return "needs-review";
}

export async function runTriageJudge(repoDir: string, finding: RawFinding): Promise<Case> {
  const tools: Record<string, ToolSpec> = {
    read_file: {
      description: "Read a file's contents by path relative to the repo root.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      handler: async (args) => toolReadFile(repoDir, String(args.path)),
    },
    grep: {
      description: "Search file contents for a regex pattern. Optionally scope with a glob.",
      parameters: {
        type: "object",
        properties: { pattern: { type: "string" }, glob: { type: "string" } },
        required: ["pattern"],
      },
      handler: async (args) => toolGrep(repoDir, String(args.pattern), args.glob ? String(args.glob) : undefined),
    },
  };

  const findingDescription = [
    `Source: ${finding.source}`,
    `Title: ${finding.title}`,
    `Description: ${finding.description}`,
    finding.package
      ? `Package: ${finding.package.name}@${finding.package.version} (${finding.package.ecosystem})`
      : null,
    finding.file ? `Location: ${finding.file.path}:${finding.file.line}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const output = await runAgentLoop<TriageOutput>({
    name: "Triage Judge",
    systemPrompt: TRIAGE_JUDGE_PROMPT,
    userPrompt: `Evaluate this finding:\n\n${findingDescription}`,
    tools,
    submitSchema: SUBMIT_SCHEMA,
    maxIterations: 3,
  });

  const verdict = computeVerdict(output);
  const reasoning = [
    `Reachability: ${output.reachable ? "reachable" : "not reachable"} — ${output.reachabilityEvidence}`,
    `Blast radius: ${output.blastRadius} — ${output.blastRadiusReason}`,
    `Safe fix: ${output.safeFixAvailable ? "available" : "not available"} — ${output.safeFixReason}`,
    `Confidence: ${output.confidence} — ${output.confidenceReason}`,
    `Verdict: ${verdict} (decision matrix applied by policy, not by the model)`,
  ];

  return {
    id: finding.id,
    source: finding.source,
    advisoryId: finding.advisoryId,
    package: finding.package,
    file: finding.file,
    reachable: output.reachable,
    blastRadius: output.blastRadius,
    confidence: output.confidence,
    verdict,
    reasoning,
    detectedAt: new Date().toISOString(),
    title: finding.title,
    suggestedFix: output.suggestedFix || undefined,
  };
}
