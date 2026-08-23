/**
 * Caps kept deliberately small (much smaller than the CLI's defaults) to
 * fit inside Groq's free-tier budget (30 req/min, 6,000 tokens/min as of
 * writing) and a single Vercel function invocation. See README.md.
 */
export const MAX_FINDINGS_PER_RUN = envInt("DOCKET_MAX_FINDINGS", 4);
export const MAX_AUTOFIX_PER_RUN = envInt("DOCKET_MAX_AUTOFIX", 1);

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
