import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as tar from "tar";

/**
 * Fetches a public GitHub repo as a tarball (codeload.github.com) and
 * extracts it into /tmp — no `git` binary required, which Vercel's Node.js
 * serverless runtime doesn't guarantee. This is the serverless-friendly
 * equivalent of the CLI's `git clone`.
 */

const MAX_TARBALL_BYTES = 40 * 1024 * 1024; // keep well inside a Vercel invocation's time/disk budget

export interface FetchedRepo {
  dir: string;
  ref: string;
  cleanup: () => Promise<void>;
}

export async function fetchRepo(owner: string, repo: string, ref?: string): Promise<FetchedRepo> {
  // Try the common branch names directly against codeload first — avoids
  // depending on the unauthenticated GitHub API's 60 req/hour-per-IP limit
  // for the common case. Only fall back to the API (for an actual default
  // branch lookup) if none of the obvious guesses pan out.
  const candidates = ref ? [ref] : ["main", "master"];
  let res: Response | undefined;
  let resolvedRef = candidates[0];

  for (const candidate of candidates) {
    const attempt = await fetch(`https://codeload.github.com/${owner}/${repo}/tar.gz/refs/heads/${candidate}`, {
      redirect: "follow",
    });
    if (attempt.ok) {
      res = attempt;
      resolvedRef = candidate;
      break;
    }
  }

  if (!res) {
    resolvedRef = await defaultBranch(owner, repo);
    res = await fetch(`https://codeload.github.com/${owner}/${repo}/tar.gz/refs/heads/${resolvedRef}`, {
      redirect: "follow",
    });
  }

  if (!res.ok || !res.body) {
    throw new Error(
      `Could not fetch ${owner}/${repo}@${resolvedRef} (${res.status}). Check the repo is public and the branch exists.`,
    );
  }

  const extractDir = path.join(os.tmpdir(), `docket-${randomUUID()}`);
  await mkdir(extractDir, { recursive: true });

  let bytesSeen = 0;
  const sizeGuard = new Transform({
    transform(chunk, _enc, callback) {
      bytesSeen += chunk.length;
      if (bytesSeen > MAX_TARBALL_BYTES) {
        callback(new Error(`Repo tarball exceeds the ${MAX_TARBALL_BYTES / (1024 * 1024)}MB limit for this free demo`));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(res.body as never), sizeGuard, tar.extract({ cwd: extractDir, strip: 1 }));
  } catch (err) {
    await rm(extractDir, { recursive: true, force: true });
    throw err;
  }

  return {
    dir: extractDir,
    ref: resolvedRef,
    cleanup: () => rm(extractDir, { recursive: true, force: true }),
  };
}

async function defaultBranch(owner: string, repo: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new Error(`GitHub repo lookup failed for ${owner}/${repo} (${res.status}). Is it public?`);
  }
  const data = (await res.json()) as { default_branch?: string };
  if (!data.default_branch) throw new Error(`Could not determine default branch for ${owner}/${repo}`);
  return data.default_branch;
}

/** Parses "owner/repo", a github.com URL, or "owner/repo@ref" into parts. */
export function parseRepoInput(input: string): { owner: string; repo: string; ref?: string } {
  let s = input.trim();
  // Strip trailing punctuation commonly picked up when a URL is
  // copy-pasted out of a sentence — a period ending the sentence, a stray
  // comma, a closing paren/bracket/quote — before it gets treated as part
  // of the repo name (a trailing "." would otherwise look for a repo
  // literally named "reponame.", which 404s and is confusing to debug).
  s = s.replace(/[.,;:)\]}>"'\s]+$/, "");
  s = s.replace(/\.git$/, "");
  s = s.replace(/^https?:\/\/(www\.)?github\.com\//, "");
  s = s.replace(/^git@github\.com:/, "");
  s = s.replace(/\/+$/, "");
  const [ownerRepo, ref] = s.split("@");
  const parts = ownerRepo.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error(`Could not parse "${input}" as a GitHub repo. Use owner/repo or a github.com URL.`);
  }
  const [owner, repo] = parts;
  return { owner, repo, ref };
}
