/**
 * Same schema as the CLI's src/types.ts (brief §9), ported unchanged. Kept
 * as a separate copy rather than a shared package because this app has a
 * different runtime (Next.js/Vercel, no filesystem persistence between
 * requests) and a different subagent implementation (Groq, not the Claude
 * Agent SDK) — see README.md for why.
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
  /** "owner/repo@ref" — this app scans a fetched GitHub tarball, not a local path. */
  repo: string;
  startedAt: string;
  finishedAt: string;
  cases: Case[];
  fixPlans: FixPlan[];
  /** Non-fatal problems surfaced to the UI (e.g. rate-limit, partial scan). */
  warnings: string[];
}
