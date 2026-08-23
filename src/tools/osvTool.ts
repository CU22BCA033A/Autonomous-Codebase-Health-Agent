import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { osvScan, fixedVersionFor, highestSeverity } from "../osv.js";

/**
 * The mechanical half of the Dependency Auditor: given packages the
 * subagent already located (by reading manifest/lockfiles), do the actual
 * OSV.dev lookups deterministically — no LLM-authored HTTP calls, no risk
 * of a hallucinated advisory ID or version range. The subagent's job is to
 * find the packages and interpret/format the results, not to re-implement
 * an API client via Bash+curl.
 */
const osvScanTool = tool(
  "osv_scan",
  "Query OSV.dev for known vulnerabilities affecting a list of packages. " +
    "Pass every direct and (where feasible) transitive dependency found in " +
    "the repo's manifest/lockfiles. Returns, per package, the full list of " +
    "matching advisories with severity, summary, and fixed-version info.",
  {
    packages: z
      .array(
        z.object({
          name: z.string().describe("Package name exactly as it appears in the manifest/lockfile"),
          ecosystem: z
            .string()
            .describe(
              "OSV ecosystem identifier: npm, PyPI, Go, crates.io, RubyGems, Packagist, Maven, NuGet, etc.",
            ),
          version: z.string().describe("Exact resolved version being used"),
        }),
      )
      .min(1)
      .max(500),
  },
  async ({ packages }) => {
    try {
      const results = await osvScan(packages);
      const withFindings = results
        .filter((r) => r.vulnerabilities.length > 0)
        .map((r) => ({
          name: r.name,
          ecosystem: r.ecosystem,
          version: r.version,
          vulnerabilities: r.vulnerabilities.map((v) => ({
            id: v.id,
            summary: v.summary,
            severity: highestSeverity(v),
            fixedVersion: fixedVersionFor(v, r.ecosystem),
            references: (v.references ?? []).map((ref) => ref.url).slice(0, 3),
          })),
        }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                queried: packages.length,
                flagged: withFindings.length,
                results: withFindings,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      // Network/API failure. Surface it as a tool error rather than
      // crashing the subagent's whole run — a transient OSV outage
      // shouldn't take down the entire scan.
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `osv_scan failed: ${(err as Error).message}. Do not guess vulnerability data yourself — report these packages as "unable to check" rather than fabricating results.`,
          },
        ],
      };
    }
  },
);

export const docketMcpServer = createSdkMcpServer({
  name: "docket",
  version: "0.1.0",
  tools: [osvScanTool],
});
