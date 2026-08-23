/**
 * §5 guardrail knobs. Kept as plain constants (overridable via env for
 * testing) rather than buried in orchestrator logic, since §8's Settings
 * view will eventually make these visible/editable — "trust in an
 * autonomous tool comes from being able to see and adjust its boundaries."
 */

/** Caps how many raw findings get triaged in one run, to bound cost/time. */
export const MAX_FINDINGS_PER_RUN = envInt("DOCKET_MAX_FINDINGS", 25);

/**
 * §5: "A cap on PRs opened per run — prevents a bad run from spamming a
 * repo with dozens of draft PRs at once." In Step 1 the Fixer never
 * actually opens a PR, but the cap applies at the same point in the
 * pipeline (how many auto-fix-eligible cases get a fix plan at all) so the
 * limit is exercised and testable now, ahead of Step 2 wiring it to a real
 * PR-open call.
 */
export const MAX_AUTOFIX_PER_RUN = envInt("DOCKET_MAX_AUTOFIX", 5);

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
