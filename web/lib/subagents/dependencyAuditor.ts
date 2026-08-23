import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { osvScan, fixedVersionFor, highestSeverity, type OsvPackageQuery } from "../osv";
import type { RawFinding } from "../types";

/**
 * Deterministic, no LLM call at all — a deliberate departure from the
 * other three subagents. Parsing a manifest/lockfile for exact name+version
 * pairs is mechanical; having a model "read" a multi-hundred-entry
 * package-lock.json as text and transcribe versions back out was pure
 * waste — slow, token-expensive (this alone could exhaust Groq's free-tier
 * per-minute budget before Code Scanner or Triage Judge ever got to run),
 * and strictly less accurate than parsing the JSON directly. The one place
 * real judgment is needed — is a flagged package actually reachable, how
 * bad is it — is still the Triage Judge's job downstream; this phase is
 * pure evidence-gathering.
 */
export async function runDependencyAuditor(repoDir: string): Promise<RawFinding[]> {
  const packages = await resolveDirectDependencies(repoDir);
  if (packages.length === 0) return [];

  let results;
  try {
    results = await osvScan(packages);
  } catch (err) {
    console.warn(`[Dependency Auditor] osv_scan failed: ${(err as Error).message}`);
    return [];
  }

  return results
    .filter((r) => r.vulnerabilities.length > 0)
    .flatMap((r) =>
      r.vulnerabilities.map((v) => ({
        id: randomUUID(),
        source: "dependency" as const,
        title: `${r.name}@${r.version}: ${v.summary ?? v.id}`,
        description: v.summary ?? v.details ?? "See the advisory for details.",
        advisoryId: v.id,
        severity: highestSeverity(v),
        package: {
          name: r.name,
          ecosystem: r.ecosystem,
          version: r.version,
          fixedVersion: fixedVersionFor(v, r.ecosystem),
        },
      })),
    );
}

async function resolveDirectDependencies(repoDir: string): Promise<OsvPackageQuery[]> {
  const [npm, pypi, go] = await Promise.all([
    resolveNpm(repoDir),
    resolvePyPI(repoDir),
    resolveGo(repoDir),
  ]);
  return [...npm, ...pypi, ...go];
}

async function resolveNpm(repoDir: string): Promise<OsvPackageQuery[]> {
  const pkgJsonPath = path.join(repoDir, "package.json");
  if (!existsSync(pkgJsonPath)) return [];

  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(await readFile(pkgJsonPath, "utf8"));
  } catch {
    return [];
  }
  const declared = { ...pkg.dependencies, ...pkg.devDependencies };
  const names = Object.keys(declared);
  if (names.length === 0) return [];

  const resolved = new Map<string, string>();
  const lockPath = path.join(repoDir, "package-lock.json");
  if (existsSync(lockPath)) {
    try {
      const lock = JSON.parse(await readFile(lockPath, "utf8")) as {
        packages?: Record<string, { version?: string }>;
        dependencies?: Record<string, { version?: string }>;
      };
      for (const name of names) {
        const version = lock.packages?.[`node_modules/${name}`]?.version ?? lock.dependencies?.[name]?.version;
        if (version) resolved.set(name, version);
      }
    } catch {
      // Malformed lockfile — fall through to the package.json range fallback below.
    }
  }

  return names
    .map((name) => ({
      name,
      ecosystem: "npm",
      version: resolved.get(name) ?? stripRangePrefix(declared[name]),
    }))
    .filter((p): p is OsvPackageQuery => /^\d/.test(p.version)); // skip "workspace:*", "file:...", git URLs, etc.
}

async function resolvePyPI(repoDir: string): Promise<OsvPackageQuery[]> {
  const reqPath = path.join(repoDir, "requirements.txt");
  if (!existsSync(reqPath)) return [];
  const content = await readFile(reqPath, "utf8");
  const deps: OsvPackageQuery[] = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.split("#")[0].trim();
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*==\s*([A-Za-z0-9_.-]+)/);
    if (match) deps.push({ name: match[1], ecosystem: "PyPI", version: match[2] });
  }
  return deps;
}

async function resolveGo(repoDir: string): Promise<OsvPackageQuery[]> {
  const modPath = path.join(repoDir, "go.mod");
  if (!existsSync(modPath)) return [];
  const content = await readFile(modPath, "utf8");
  const deps: OsvPackageQuery[] = [];
  const block = content.match(/require\s*\(([\s\S]*?)\)/);
  const lines = block ? block[1].split("\n") : content.split("\n").filter((l) => l.trim().startsWith("require "));
  for (const rawLine of lines) {
    const match = rawLine.trim().match(/^(?:require\s+)?(\S+)\s+(v\d\S*)/);
    if (match) deps.push({ name: match[1], ecosystem: "Go", version: match[2] });
  }
  return deps;
}

function stripRangePrefix(range: string): string {
  return range.replace(/^[\^~>=<]+/, "").split(" ")[0].trim();
}
