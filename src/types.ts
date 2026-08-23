/**
 * Core data schema. Both scanner subagents produce RawFindings; the Triage
 * Judge consumes exactly one RawFinding and produces exactly one Case. The
 * dashboard (not built yet) will be a pure rendering layer over Case[].
 */

export type Source = "dependency" | "code-scan";
export type BlastRadius = "low" | "high";
export type Confidence = "high" | "low";
export type Verdict = "auto-fixed" | "needs-review" | "low-priority";

export interface PackageRef {
  name: string;
  ecosystem: string;
  version: string;
  fixedVersion?: string;
}

export interface FileRef {
  path: string;
  line: number;
}

/** Output of the Dependency Auditor and Code Scanner subagents. */
export interface RawFinding {
  id: string;
  source: Source;
  title: string;
  description: string;
  advisoryId?: string;
  severity?: string;
  package?: PackageRef;
  file?: FileRef;
  references?: string[];
}

/**
 * A case awaiting judgment. Matches brief §9 exactly, plus a few fields
 * (title, suggestedFix) that carry context through to the Fixer and the
 * console report without overloading `reasoning`.
 */
export interface Case {
  id: string;
  source: Source;
  advisoryId?: string;
  package?: PackageRef;
  file?: FileRef;
  reachable: boolean;
  blastRadius: BlastRadius;
  confidence: Confidence;
  verdict: Verdict;
  reasoning: string[];
  prUrl?: string;
  detectedAt: string;
  resolvedAt?: string;

  title: string;
  suggestedFix?: string;
}

/** Fixer's Step-1 output: a proposal, never an executed action. See fixer.ts. */
export interface FixPlan {
  caseId: string;
  branchName: string;
  summary: string;
  diffPreview: string;
  testCommand: string;
  dryRun: true;
}

export interface ScanRun {
  id: string;
  repoPath: string;
  startedAt: string;
  finishedAt: string;
  cases: Case[];
  fixPlans: FixPlan[];
}
