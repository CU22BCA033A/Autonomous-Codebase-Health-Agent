"use client";

import { useState } from "react";
import type { ScanRun, Case } from "@/lib/types";

const VERDICT_LABEL: Record<Case["verdict"], string> = {
  "auto-fixed": "AUTO-FIX ELIGIBLE",
  "needs-review": "NEEDS REVIEW",
  "low-priority": "LOW PRIORITY",
};

export default function Home() {
  const [repo, setRepo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<ScanRun | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!repo.trim()) return;
    setLoading(true);
    setError(null);
    setRun(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo: repo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setRun(data as ScanRun);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const groups = run
    ? {
        "needs-review": run.cases.filter((c) => c.verdict === "needs-review"),
        "auto-fixed": run.cases.filter((c) => c.verdict === "auto-fixed"),
        "low-priority": run.cases.filter((c) => c.verdict === "low-priority"),
      }
    : null;

  return (
    <main>
      <h1>Docket</h1>
      <p className="subtitle">
        Free-tier build — runs on Groq&apos;s free API instead of a paid LLM. Public GitHub repos only, small/quick
        scans (findings are capped to fit the free-tier budget). See the README for details and limits.
      </p>

      <form onSubmit={onSubmit}>
        <input
          type="text"
          placeholder="owner/repo or a github.com URL"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !repo.trim()}>
          {loading ? "Scanning…" : "Scan"}
        </button>
      </form>
      <p className="hint">
        e.g. <code>OWASP/NodeGoat</code> — small repos scan faster and are more likely to finish within the free
        function time limit.
      </p>

      {error && <div className="error">{error}</div>}

      {run && (
        <>
          {run.warnings.length > 0 && (
            <div className="warnings">
              <strong>Warnings</strong>
              <ul>
                {run.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="summary">
            {run.repo} — {run.cases.length} case(s): {groups!["needs-review"].length} need review,{" "}
            {groups!["auto-fixed"].length} auto-fix eligible, {groups!["low-priority"].length} low priority.
          </p>

          {run.cases.length === 0 && !error && <p>No findings this run.</p>}

          {(["needs-review", "auto-fixed", "low-priority"] as const).map((verdict) =>
            groups![verdict].length > 0 ? (
              <section key={verdict}>
                <h2>{VERDICT_LABEL[verdict]}</h2>
                {groups![verdict].map((c) => (
                  <CaseCard key={c.id} c={c} fixPlan={run.fixPlans.find((p) => p.caseId === c.id)} />
                ))}
              </section>
            ) : null,
          )}
        </>
      )}
    </main>
  );
}

function CaseCard({ c, fixPlan }: { c: Case; fixPlan?: ScanRun["fixPlans"][number] }) {
  return (
    <div className="case">
      <span className={`verdict-badge verdict-${c.verdict}`}>{VERDICT_LABEL[c.verdict]}</span>
      <h3>{c.title}</h3>
      <div className="meta">
        {c.package && (
          <div>
            {c.package.name}@{c.package.version} ({c.package.ecosystem})
            {c.package.fixedVersion ? ` → fixed in ${c.package.fixedVersion}` : ""}
          </div>
        )}
        {c.file && (
          <div>
            {c.file.path}:{c.file.line}
          </div>
        )}
        <div>
          reachable={String(c.reachable)} blastRadius={c.blastRadius} confidence={c.confidence}
        </div>
      </div>
      <ul className="reasoning">
        {c.reasoning.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      {fixPlan && (
        <div className="fixplan">
          <strong>[DRY RUN] Fix proposal</strong> — branch <code>{fixPlan.branchName}</code>
          <br />
          {fixPlan.summary}
          <br />
          Test: <code>{fixPlan.testCommand}</code>
          <pre>{fixPlan.diffPreview}</pre>
        </div>
      )}
    </div>
  );
}
