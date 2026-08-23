import { NextRequest, NextResponse } from "next/server";
import { runScan } from "@/lib/orchestrator";

// Node runtime required: this route spawns fetch+stream-extract of a
// tarball and reads/greps files from /tmp — not available on the Edge
// runtime.
export const runtime = "nodejs";
// 60s was too tight in practice: a real repo (several findings, each
// triaged via multiple sequential Groq calls) routinely exceeds it and
// Vercel kills the function mid-request, returning its own HTML/text error
// page instead of a JSON response. 300s is Vercel's documented ceiling for
// Hobby with Fluid Compute (the default since ~2025) — if your account
// predates that and this causes a deploy-time "maxDuration too high"
// error, enable Fluid Compute under Project Settings → Functions, or lower
// this back down and reduce DOCKET_MAX_FINDINGS to compensate.
export const maxDuration = 300;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { repo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.repo || typeof body.repo !== "string") {
    return NextResponse.json({ error: "Missing 'repo' (e.g. \"owner/repo\" or a github.com URL)" }, { status: 400 });
  }

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not configured on this deployment. Get a free key at console.groq.com/keys." },
      { status: 500 },
    );
  }

  try {
    const run = await runScan(body.repo);
    return NextResponse.json(run);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
