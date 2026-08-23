/**
 * OSV.dev client. Primary vulnerability data source (brief §3): aggregates
 * GHSA, PyPA, RustSec, the Go vuln DB, and ~30 ecosystems into one schema,
 * free, no API key, no meaningful rate limit at this scale.
 *
 * The querybatch endpoint returns only vuln IDs per package; full details
 * (severity, summary, affected ranges) require a follow-up GET per unique
 * ID. We do both here so the Dependency Auditor subagent gets one tool call
 * that returns fully-formed results, rather than reimplementing HTTP/pagination
 * itself via Bash+curl.
 */

const OSV_API = "https://api.osv.dev/v1";

export interface OsvPackageQuery {
  name: string;
  ecosystem: string;
  version: string;
}

export interface OsvSeverity {
  type: string;
  score: string;
}

export interface OsvAffectedRange {
  type: string;
  events: Array<Record<string, string>>;
}

export interface OsvVulnerability {
  id: string;
  summary?: string;
  details?: string;
  severity?: OsvSeverity[];
  affected?: Array<{
    package?: { name: string; ecosystem: string };
    ranges?: OsvAffectedRange[];
    versions?: string[];
  }>;
  references?: Array<{ type: string; url: string }>;
  modified?: string;
}

export interface OsvResultForPackage extends OsvPackageQuery {
  vulnerabilities: OsvVulnerability[];
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${OSV_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`OSV ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${OSV_API}${path}`);
  if (!res.ok) {
    throw new Error(`OSV ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

interface QueryBatchResponse {
  results: Array<{ vulns?: Array<{ id: string; modified?: string }> }>;
}

interface VulnsBatchGetResponse {
  vulns: OsvVulnerability[];
}

/**
 * Given a list of (package, ecosystem, version) triples, returns full
 * vulnerability details for each. Dedupes vuln-detail lookups across
 * packages since the same advisory often affects multiple entries in a
 * dependency tree (e.g. a transitive dep pinned in several places).
 */
export async function osvScan(
  queries: OsvPackageQuery[],
): Promise<OsvResultForPackage[]> {
  if (queries.length === 0) return [];

  const CHUNK = 100; // OSV querybatch accepts up to 1000; keep chunks modest
  const idsPerQuery: Array<{ id: string }[]> = [];
  for (let i = 0; i < queries.length; i += CHUNK) {
    const chunk = queries.slice(i, i + CHUNK);
    const res = await postJson<QueryBatchResponse>("/querybatch", {
      queries: chunk.map((q) => ({
        package: { name: q.name, ecosystem: q.ecosystem },
        version: q.version,
      })),
    });
    for (const r of res.results) {
      idsPerQuery.push((r.vulns ?? []).map((v) => ({ id: v.id })));
    }
  }

  const uniqueIds = new Set<string>();
  for (const ids of idsPerQuery) {
    for (const { id } of ids) uniqueIds.add(id);
  }

  const detailsById = new Map<string, OsvVulnerability>();
  const idList = [...uniqueIds];
  const DETAIL_CHUNK = 100;
  for (let i = 0; i < idList.length; i += DETAIL_CHUNK) {
    const chunk = idList.slice(i, i + DETAIL_CHUNK);
    // No official batch-get-details endpoint; vulns/{id} is the documented
    // way to get full records, so fetch this chunk concurrently.
    const results = await Promise.all(
      chunk.map((id) => getJson<OsvVulnerability>(`/vulns/${id}`)),
    );
    for (const v of results) detailsById.set(v.id, v);
  }

  return queries.map((q, i) => ({
    ...q,
    vulnerabilities: idsPerQuery[i]
      .map(({ id }) => detailsById.get(id))
      .filter((v): v is OsvVulnerability => v !== undefined),
  }));
}

export function highestSeverity(vuln: OsvVulnerability): string | undefined {
  if (!vuln.severity || vuln.severity.length === 0) return undefined;
  return vuln.severity[0].score;
}

export function fixedVersionFor(
  vuln: OsvVulnerability,
  ecosystem: string,
): string | undefined {
  for (const affected of vuln.affected ?? []) {
    if (affected.package?.ecosystem !== ecosystem) continue;
    for (const range of affected.ranges ?? []) {
      const fixEvent = [...range.events]
        .reverse()
        .find((e) => "fixed" in e);
      if (fixEvent?.fixed) return fixEvent.fixed;
    }
  }
  return undefined;
}
