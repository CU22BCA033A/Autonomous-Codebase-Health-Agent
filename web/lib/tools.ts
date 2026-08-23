import { readFile as fsReadFile, stat } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";

/**
 * File tools available to the subagents, sandboxed to one extracted repo
 * directory. Implemented in plain JS rather than shelling out to Bash
 * (unlike the CLI's Triage Judge, which gets a real Bash tool) — safer and
 * faster inside a serverless function, and sufficient for the read/search
 * operations these subagents actually need.
 */

const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/vendor/**",
  "**/*.min.js",
  "**/package-lock.json",
  "**/pnpm-lock.yaml",
  "**/yarn.lock",
];

const MAX_READ_CHARS = 6000;
const MAX_FILE_BYTES_FOR_GREP = 300_000;
const MAX_LIST_RESULTS = 200;
const MAX_GREP_MATCHES = 30;

function safeResolve(repoDir: string, requested: string): string {
  const resolved = path.resolve(repoDir, requested.replace(/^\/+/, ""));
  if (resolved !== repoDir && !resolved.startsWith(repoDir + path.sep)) {
    throw new Error(`Path "${requested}" resolves outside the repo — not allowed.`);
  }
  return resolved;
}

export async function toolReadFile(repoDir: string, filePath: string): Promise<string> {
  const resolved = safeResolve(repoDir, filePath);
  const content = await fsReadFile(resolved, "utf8");
  if (content.length > MAX_READ_CHARS) {
    return `${content.slice(0, MAX_READ_CHARS)}\n…(truncated, ${content.length} chars total — read is capped for this free demo)`;
  }
  return content;
}

export async function toolListFiles(repoDir: string, pattern: string): Promise<string> {
  const matches = await fg(pattern || "**/*", {
    cwd: repoDir,
    ignore: DEFAULT_IGNORE,
    onlyFiles: true,
    dot: false,
  });
  const capped = matches.slice(0, MAX_LIST_RESULTS);
  const suffix = matches.length > MAX_LIST_RESULTS ? `\n…(${matches.length - MAX_LIST_RESULTS} more not shown)` : "";
  return capped.join("\n") + suffix;
}

export async function toolGrep(repoDir: string, pattern: string, globPattern?: string): Promise<string> {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "i");
  } catch (err) {
    throw new Error(`Invalid regex "${pattern}": ${(err as Error).message}`);
  }

  const files = await fg(globPattern || "**/*.{js,ts,jsx,tsx,py,rb,go,java,php,json,yml,yaml,env,txt,md}", {
    cwd: repoDir,
    ignore: DEFAULT_IGNORE,
    onlyFiles: true,
    dot: false,
  });

  const results: string[] = [];
  for (const rel of files) {
    if (results.length >= MAX_GREP_MATCHES) break;
    const full = path.join(repoDir, rel);
    let st;
    try {
      st = await stat(full);
    } catch {
      continue;
    }
    if (st.size > MAX_FILE_BYTES_FOR_GREP) continue;

    let content: string;
    try {
      content = await fsReadFile(full, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        results.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
        if (results.length >= MAX_GREP_MATCHES) break;
      }
    }
  }

  return results.length > 0 ? results.join("\n") : "No matches.";
}
