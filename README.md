# Docket

An autonomous codebase health agent. For every finding, Docket doesn't just
list it — it reasons through whether the issue is actually reachable in
*this* codebase, how bad it would be if exploited, and whether a safe
mechanical fix exists, then produces a verdict with a visible chain of
reasoning.

This repo currently implements **Step 1 of the build brief only**: the
headless agent core, run from a terminal, with no dashboard. See
`brief.md`-equivalent context in the task history for the full plan — the
dashboard, GitHub Action triggers, and the real branch/test/PR fix flow are
later steps.

## Architecture

Built on the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
(`@anthropic-ai/claude-agent-sdk`). One thin orchestrator dispatches to four
specialist subagents, each its own scoped `query()` call with least-privilege
tool grants:

| Subagent | Tools | Job |
|---|---|---|
| Dependency Auditor | Read, Glob, Grep, `osv_scan` (custom) | Finds manifests/lockfiles, checks every package against OSV.dev |
| Code Scanner | Read, Glob, Grep | Reads source for risky patterns (secrets, SQLi, unsafe deserialization, silent broad excepts) |
| Triage Judge | Read, Glob, Grep, Bash | Runs the four-question decision framework below on one finding |
| Fixer | Read, Glob, Grep (**no write tools**) | Proposes a fix for auto-fix-eligible cases — proposal only in Step 1, see below |

Each subagent is its own `query()` call rather than one long-lived
conversation dispatching via the Task tool. That keeps dispatch order
deterministic (every finding actually gets triaged, in a predictable
sequence) and keeps each specialist's tool access provably least-privilege,
at the cost of losing shared context between subagents — a deliberate
trade-off for a pipeline whose whole point is that the triage step has to be
trustworthy.

### The triage decision matrix

The Triage Judge subagent answers four questions with grounded evidence
(reachability search, blast-radius assessment, fix-safety check,
confidence) but **does not compute the final verdict itself**. That happens
deterministically in `src/agents/triageJudge.ts::computeVerdict`, applying
this precedence:

1. Confidence low → always `needs-review`, regardless of everything else.
2. Not reachable (and confident) → `low-priority`.
3. Reachable + high blast radius → always `needs-review`, no matter how
   safe the fix looks on paper. This is a strict allowlist gate, not a
   judgment call the model can override.
4. Reachable + low blast radius + safe fix available → `auto-fixed`
   (eligible; see Fixer's scope below).
5. Otherwise → `needs-review`.

This mirrors the brief's guardrail: "Auto-fix eligibility is a strict
allowlist, not a judgment call made fresh each time." Belt-and-suspenders —
even if the model's own reasoning were to waver, the policy code can't.

### Fixer is proposal-only in Step 1

The Fixer subagent has no Write, Edit, or Bash tool access at all, and its
system prompt explicitly forbids touching the repo. It produces a `FixPlan`
(branch name, diff preview, test command) that gets printed and written to
the run artifact — nothing is applied. The brief reserves the real
branch/apply-fix/run-tests/open-draft-PR flow for Step 2 as its own,
separately-reviewed piece of work, since it's the highest-stakes code in the
project.

### Audit trail

Every subagent's `query()` call is wired with `PreToolUse`/`PostToolUse`
hooks (`src/auditLog.ts`) that log every tool call — what was read, what was
queried — to `docket-runs/<runId>/audit-log.json`. This is both a safety
feature (per brief §5) and the future dashboard's reasoning-trail data
source.

## Running it

```
npm install
npm run scan -- <path-to-a-repo>
```

Requires a working `claude` CLI auth session (OAuth login or
`ANTHROPIC_API_KEY`) in the environment, since the SDK spawns the Claude
Code CLI as a subprocess to run each subagent.

Output: a console report grouped by verdict, plus
`docket-runs/<runId>/{cases.json,audit-log.json}` matching the `Case`
schema in `src/types.ts`.

Guardrail knobs (`src/config.ts`, overridable via env for now — a proper
editable allowlist is the dashboard's Settings view in a later step):

- `DOCKET_MAX_FINDINGS` (default 25) — caps findings triaged per run.
- `DOCKET_MAX_AUTOFIX` (default 5) — caps auto-fix proposals per run.

## Known limitation in this validation environment

OSV.dev (`api.osv.dev`) is blocked by this sandbox's egress policy (confirmed
via a direct proxy CONNECT test — a 403 policy denial, not a transient
failure). The `osv_scan` tool call fails gracefully — the Dependency
Auditor reports the failure and correctly returns zero fabricated findings
rather than guessing — but dependency-vulnerability findings can't be
live-validated from inside this sandbox. `src/osv.ts` implements the real
OSV.dev `/querybatch` + `/vulns/{id}` API and will work in a normal
deployment environment (e.g. the GitHub Action from a later step) with
standard internet egress.

Validation here instead focused on the Code Scanner → Triage Judge path
(the part of the pipeline the brief calls "the interesting part") against
[OWASP NodeGoat](https://github.com/OWASP/NodeGoat), a real, intentionally
vulnerable Node.js application used for security training — chosen because
a clean, well-audited repo (first tried: Express core) produced zero
findings and couldn't exercise the triage logic's different verdict paths.

## Validation results (NodeGoat, full pipeline, live)

Code Scanner found 7 real findings reading NodeGoat's actual source (no
fixed pattern list, no pre-existing vulnerability database — direct
reasoning about the code): RCE via `eval()` on user input, SSRF and open
redirect via an unvalidated `url` param, NoSQL injection via a
string-interpolated `$where` query, a hardcoded session-signing secret,
plaintext password storage with non-constant-time comparison, and hardcoded
default admin credentials in a seed script.

The Triage Judge traced each one to a real route registration and auth
gate (Grep/Read/Bash — not assumed from the finding's description alone)
before answering the four questions, then all 7 landed on **needs-review**
via the deterministic decision matrix — every one is reachable from a
public, session-gated (not admin-gated) HTTP route touching auth, PII, or
RCE, so blast radius is HIGH for all of them. That's the guardrail working
as intended: several of these had an obviously safe-looking mechanical fix
sitting right there in the file as commented-out code (e.g. the NoSQL
injection and the plaintext-password cases both have the fixed version
already written, just disabled) — and the matrix still refused to mark
them auto-fix-eligible, because blast radius alone gates that regardless of
fix quality. Nothing in this run was low-priority or auto-fix-eligible,
which is the correct outcome for a codebase where every real finding is
security-critical, not a gap in the pipeline.

Since that meant the Fixer never got exercised in the full run, it was
validated separately: given a synthetic low-blast-radius, auto-fix-eligible
case (a dev-only devDependency patch bump) against this repo itself, Fixer
correctly read the actual `package.json`, noticed there's no `test` script
defined, and proposed `npm run typecheck && npm run build` as the
validation gate instead of guessing — producing an accurate branch name,
diff, and summary without touching any files (no write tools are granted
to it in this step).
