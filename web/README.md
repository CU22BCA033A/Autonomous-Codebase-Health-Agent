# Docket (free tier)

A zero-cost, Vercel-deployable build of Docket. Same triage philosophy as
the CLI in `../src` (every finding gets reachability/blast-radius/fix-
safety/confidence reasoning, with the final verdict computed
deterministically rather than trusted to the model) — but rebuilt against
[Groq's free API](https://console.groq.com) instead of the Claude Agent
SDK, since Anthropic's API has no ongoing free tier and this build needed
one.

**Why a separate app instead of reusing `src/`:** the CLI's architecture is
inherently paid (Claude API tokens) and needs a persistent process that can
spawn the `claude` CLI as a subprocess and read a local git checkout —
neither fits a $0 serverless deployment. This app is a from-scratch
reimplementation of the same four-subagent pipeline against a free LLM
provider, with its own hand-rolled agent loop (`lib/agentLoop.ts`) standing
in for what the Claude Agent SDK gives for free.

## What's different from the CLI version

| | CLI (`../src`) | This app (`web/`) |
|---|---|---|
| LLM | Claude, via Claude Agent SDK | `openai/gpt-oss-120b` on Groq (free tier) |
| Cost | Pay-per-token (Anthropic API) | $0 — Groq's free tier, no card required |
| Repo access | Local filesystem (`git clone` yourself, then point the CLI at it) | Fetches a public GitHub repo's tarball into `/tmp` per request |
| Runtime | Long-running terminal process | One bounded HTTP request (Vercel serverless function) |
| Tools given to subagents | Claude Code's real Read/Grep/Glob/Bash | Hand-rolled `read_file`/`list_files`/`grep`, sandboxed to the fetched repo dir |
| Fixer | Proposal-only (no write tools) | Same — proposal-only |
| Findings per run | Up to 25 by default | Up to 4 by default (free-tier token/time budget) |

The **decision matrix is unchanged** — `lib/subagents/triageJudge.ts`'s
`computeVerdict` is the same logic as the CLI's, ported line-for-line: a
high blast radius always routes to `needs-review`, regardless of what the
model concludes about fix safety.

## Setup

1. Get a free Groq API key: [console.groq.com/keys](https://console.groq.com/keys) (no credit card).
2. `cd web && npm install`
3. `cp .env.local.example .env.local` and put your key in it.
4. `npm run dev`, open `http://localhost:3000`, paste a small public GitHub repo (e.g. `OWASP/NodeGoat`), hit Scan.

## Deploying to Vercel (free Hobby tier)

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. In Vercel, "Add New Project" → import this repo → **set the project's Root Directory to `web`** (this is a subdirectory of a monorepo that also has the CLI at the root — Vercel needs to know to build from here).
3. Add an environment variable: `GROQ_API_KEY` = your key from step 1 above.
4. Deploy. Framework preset should auto-detect as Next.js.

That's it — no other services, no database, no paid tier of anything.

## Known limits (read before reporting something as broken)

- **Public GitHub repos only.** No auth for private repos or other Git hosts in this build.
- **Findings are capped hard** (`DOCKET_MAX_FINDINGS`, default 4; `DOCKET_MAX_AUTOFIX`, default 1) to fit inside Groq's free-tier budget (as of writing: 30 requests/min, 6,000 tokens/min, 14,400 requests/day per org) and a single Vercel function invocation. Raise these env vars if you have headroom — you'll know you don't when you start seeing 429s in the warnings list.
- **`maxDuration` is set to 300s** in `app/api/scan/route.ts` — Vercel's documented ceiling for Hobby with Fluid Compute (the default on newer accounts). A real repo genuinely needs most of this: several findings, each triaged via multiple sequential Groq calls, adds up fast. If your account predates Fluid Compute, deploy will error with something like "maxDuration too high for your plan" — enable Fluid Compute under Project Settings → Functions, or lower this value and lower `DOCKET_MAX_FINDINGS` to compensate. If a scan still times out (the page will say so explicitly rather than showing a raw parse error), that's this limit, not a different bug.
- **Reasoning quality is noticeably weaker than the Claude version.** `openai/gpt-oss-120b` is a capable open model with real tool-calling support, but the ambiguous judgment calls this pipeline is built around (is this *actually* reachable? does this *really* touch PII?) are exactly where a smaller/weaker model is more likely to be shallow or inconsistent than Claude. Treat this build as "free and directionally useful," not as a drop-in quality replacement for the CLI.
- **Only direct dependencies are checked** (not the full transitive tree) to keep the OSV.dev payload and Groq's tool-calling loop small.
- **No persistence.** Every scan is stateless — nothing is saved between requests. This is a single-request demo, not the data layer from later steps of the build plan.
- **`npm audit` will flag postcss/sharp advisories** inherited from Next.js 15's optional image-optimization pipeline. This app doesn't use `next/image` or process user-supplied CSS/images, so they're not reachable through anything this app does; fixing them requires Next 16, which wasn't validated here.
- **Groq deprecates/renames models with little notice.** This build originally targeted `llama-3.3-70b-versatile`, which Groq deprecated for free/developer-tier use in June 2026; it's now on `openai/gpt-oss-120b` (Groq's own recommended replacement for tool-calling workloads). If you start seeing `model_not_found` (404) warnings again, check [console.groq.com/docs/models](https://console.groq.com/docs/models) for the current model ID and set `GROQ_MODEL` in your Vercel env vars rather than waiting on a code change.

## Repo input format

Accepts `owner/repo`, a `github.com/owner/repo` URL, or `owner/repo@branch`
to target a specific branch instead of the default.
