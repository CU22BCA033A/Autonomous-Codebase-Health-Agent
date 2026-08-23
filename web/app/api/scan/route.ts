import { NextRequest, NextResponse } from "next/server";
import { runScan } from "@/lib/orchestrator";

// Node runtime required: this route spawns fetch+stream-extract of a
// tarball and reads/greps files from /tmp — not available on the Edge
// runtime.
export const runtime = "nodejs";
// Conservative default that works unmodified on Vercel Hobby. Raise this
// (and DOCKET_MAX_FINDINGS) if your plan allows a longer function duration.
export const maxDuration = 60;

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
