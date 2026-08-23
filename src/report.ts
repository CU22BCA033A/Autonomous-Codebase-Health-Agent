import type { Case, ScanRun } from "./types.js";

const VERDICT_LABEL: Record<Case["verdict"], string> = {
  "auto-fixed": "AUTO-FIX ELIGIBLE",
  "needs-review": "NEEDS REVIEW",
  "low-priority": "LOW PRIORITY",
};

function printCase(c: Case): void {
  console.log(`\n${"-".repeat(72)}`);
  console.log(`[${VERDICT_LABEL[c.verdict]}] ${c.title}`);
  if (c.package) {
    console.log(
      `  Package: ${c.package.name}@${c.package.version} (${c.package.ecosystem})` +
        (c.package.fixedVersion ? ` → fixed in ${c.package.fixedVersion}` : ""),
    );
  }
  if (c.file) console.log(`  Location: ${c.file.path}:${c.file.line}`);
  if (c.advisoryId) console.log(`  Advisory: ${c.advisoryId}`);
  console.log(`  Reachable: ${c.reachable} | Blast radius: ${c.blastRadius} | Confidence: ${c.confidence}`);
  console.log(`  Reasoning:`);
  for (const line of c.reasoning) console.log(`    - ${line}`);
  if (c.suggestedFix) console.log(`  Suggested fix: ${c.suggestedFix}`);
}

export function printReport(run: ScanRun): void {
  const byVerdict = {
    "auto-fixed": run.cases.filter((c) => c.verdict === "auto-fixed"),
    "needs-review": run.cases.filter((c) => c.verdict === "needs-review"),
    "low-priority": run.cases.filter((c) => c.verdict === "low-priority"),
  };

  console.log(`\n${"=".repeat(72)}`);
  console.log(`DOCKET REPORT — ${run.repoPath}`);
  console.log(`Run ${run.id} | ${run.startedAt} → ${run.finishedAt}`);
  console.log(`${"=".repeat(72)}`);
  console.log(
    `${run.cases.length} case(s): ${byVerdict["needs-review"].length} need review, ` +
      `${byVerdict["auto-fixed"].length} auto-fix eligible, ${byVerdict["low-priority"].length} low priority.`,
  );

  if (run.cases.length === 0) {
    console.log("\nNo findings this run. Clean sweep.");
    return;
  }

  if (byVerdict["needs-review"].length > 0) {
    console.log(`\n### NEEDS REVIEW — a human should look at these ###`);
    for (const c of byVerdict["needs-review"]) printCase(c);
  }

  if (byVerdict["auto-fixed"].length > 0) {
    console.log(`\n\n### AUTO-FIX ELIGIBLE ###`);
    for (const c of byVerdict["auto-fixed"]) {
      printCase(c);
      const plan = run.fixPlans.find((p) => p.caseId === c.id);
      if (plan) {
        console.log(`  [DRY RUN] Fixer proposal (not applied — see brief §10 step 2 for the real PR-open path):`);
        console.log(`    Branch: ${plan.branchName}`);
        console.log(`    Summary: ${plan.summary}`);
        console.log(`    Test command: ${plan.testCommand}`);
        console.log(`    Diff:\n${indent(plan.diffPreview, 6)}`);
      } else {
        console.log(`  [DRY RUN] No fix plan produced (capped by DOCKET_MAX_AUTOFIX, or Fixer failed).`);
      }
    }
  }

  if (byVerdict["low-priority"].length > 0) {
    console.log(`\n\n### LOW PRIORITY — reported, not blocking ###`);
    for (const c of byVerdict["low-priority"]) printCase(c);
  }

  console.log(`\n${"=".repeat(72)}\n`);
}

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((l) => pad + l)
    .join("\n");
}
