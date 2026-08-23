import { runSubagent } from "./runAgent.js";
import { TRIAGE_JUDGE_PROMPT } from "./prompts.js";
import type { AuditLog } from "../auditLog.js";
import type { BlastRadius, Case, Confidence, RawFinding, Verdict } from "../types.js";

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reachable: { type: "boolean" },
    reachabilityEvidence: {
      type: "string",
      description: "What you searched and what you found. Cite files.",
    },
    blastRadius: { type: "string", enum: ["low", "high"] },
    blastRadiusReason: { type: "string" },
    safeFixAvailable: { type: "boolean" },
    safeFixReason: { type: "string" },
    confidence: { type: "string", enum: ["high", "low"] },
    confidenceReason: { type: "string" },
    suggestedFix: {
      type: "string",
      description: "One sentence describing the fix, if any is available. Empty string if none.",
    },
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
} as const;

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

/**
 * §4's decision matrix, applied deterministically here rather than trusting
 * the model to self-report a verdict. This is the concrete mechanism behind
 * §5's "strict allowlist, not a judgment call made fresh each time": no
 * matter what the model concludes about fix safety, a HIGH blast radius (or
 * LOW confidence) can never resolve to auto-fix-eligible.
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

export async function runTriageJudge(
  repoPath: string,
  finding: RawFinding,
  auditLog: AuditLog,
): Promise<Case> {
  const findingDescription = [
    `Source: ${finding.source}`,
    `Title: ${finding.title}`,
    `Description: ${finding.description}`,
    finding.advisoryId ? `Advisory: ${finding.advisoryId}` : null,
    finding.severity ? `Severity: ${finding.severity}` : null,
    finding.package
      ? `Package: ${finding.package.name}@${finding.package.version} (${finding.package.ecosystem})` +
        (finding.package.fixedVersion ? `, fixed in ${finding.package.fixedVersion}` : "")
      : null,
    finding.file ? `Location: ${finding.file.path}:${finding.file.line}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const output = await runSubagent<TriageOutput>({
    name: "Triage Judge",
    systemPrompt: TRIAGE_JUDGE_PROMPT,
    userPrompt: `Evaluate this finding:\n\n${findingDescription}`,
    cwd: repoPath,
    tools: ["Read", "Glob", "Grep", "Bash"],
    outputSchema: OUTPUT_SCHEMA,
    auditLog,
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
