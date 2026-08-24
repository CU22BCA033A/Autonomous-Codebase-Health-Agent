/**
 * Thin client for Groq's OpenAI-compatible chat completions API. Groq's
 * free tier (no credit card, https://console.groq.com) is the whole reason
 * this app can run at zero cost — in exchange it's rate-limited (as of
 * writing: 30 requests/min, 8,000 tokens/min, 14,400 requests/day per org).
 * Every call here respects that: 429s get a bounded retry with backoff
 * instead of hammering the API, and callers (agentLoop.ts) are responsible
 * for keeping prompts and tool results lean so a single scan doesn't blow
 * the per-minute token budget.
 */

const GROQ_API = "https://api.groq.com/openai/v1";
// llama-3.3-70b-versatile was deprecated by Groq (June 2026); their
// recommended replacement for tool-calling/agentic use is gpt-oss-120b.
export const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

// gpt-oss models are "reasoning" models — by default (Groq's "medium"
// effort) they spend a chunk of the output-token budget on an internal
// reasoning pass before ever emitting a tool call. Combined with a low
// max_tokens ceiling, that reasoning can eat the whole budget and get cut
// off (finish_reason: "length") before a tool call is ever produced —
// which looks like "the model did nothing" from the caller's side. "low"
// effort trades some of that deliberation for actually finishing the turn,
// which matters more here than reasoning depth given the free-tier budget.
const IS_REASONING_MODEL = /^openai\/gpt-oss-/.test(GROQ_MODEL);

export interface GroqToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface GroqMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface GroqToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface GroqChatResult {
  message: GroqMessage;
  finishReason: string;
}

interface GroqChatResponse {
  choices: Array<{
    message: GroqMessage;
    finish_reason: string;
  }>;
  usage?: { total_tokens: number; completion_tokens?: number; prompt_tokens?: number };
}

export class GroqError extends Error {}

/**
 * Thrown when we force tool_choice to a specific tool (submit_result) but
 * the model generates a call to a *different* tool anyway — Groq validates
 * this server-side and rejects the whole request with a 400 rather than
 * just running the call, so what would otherwise be a normal tool call
 * becomes a hard failure. Carries the tool call the model actually wanted
 * to make (parsed from the error's failed_generation field) so the caller
 * can honor it instead of losing the model's work.
 */
export class ToolChoiceMismatchError extends GroqError {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly toolArgs: Record<string, unknown>,
  ) {
    super(message);
  }
}

function parseToolChoiceMismatch(body: string): { name: string; args: Record<string, unknown> } | null {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; failed_generation?: string } };
    const message = parsed.error?.message ?? "";
    const failedGeneration = parsed.error?.failed_generation;
    if (!failedGeneration || !message.includes("does not match request.tool_choice")) return null;
    const gen = JSON.parse(failedGeneration) as { name?: string; arguments?: string | Record<string, unknown> };
    if (!gen.name) return null;
    const args = typeof gen.arguments === "string" ? JSON.parse(gen.arguments) : (gen.arguments ?? {});
    return { name: gen.name, args };
  } catch {
    return null;
  }
}

function apiKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new GroqError(
      "GROQ_API_KEY is not set. Get a free key at https://console.groq.com/keys and set it as an env var.",
    );
  }
  return key;
}

/**
 * One chat completion call, with bounded retry on 429 (respects
 * Retry-After when present) and on transient 5xx. Not retried on 4xx other
 * than 429 — those are our bug, not a transient condition.
 */
export async function groqChat(
  messages: GroqMessage[],
  opts: { tools?: GroqToolDef[]; toolChoice?: "auto" | { type: "function"; function: { name: string } }; maxTokens?: number } = {},
): Promise<GroqChatResult> {
  const MAX_ATTEMPTS = 4;
  let lastError: Error | undefined;
  // Belt-and-suspenders: reasoning_effort is a real, documented Groq
  // parameter for gpt-oss models, but it hasn't been exercised against a
  // live account here — if the API rejects it (400) for any reason, drop
  // it and retry rather than hard-failing every single call on an
  // unverified parameter.
  let includeReasoningEffort = IS_REASONING_MODEL;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${GROQ_API}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        tools: opts.tools,
        tool_choice: opts.toolChoice ?? (opts.tools ? "auto" : undefined),
        temperature: 0.1,
        max_tokens: opts.maxTokens ?? 2048,
        ...(includeReasoningEffort ? { reasoning_effort: "low" } : {}),
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as GroqChatResponse;
      const choice = data.choices[0];
      if (!choice) throw new GroqError("Groq returned no choices");
      console.log(
        `[groq] finish_reason=${choice.finish_reason} tokens=${data.usage?.total_tokens ?? "?"} ` +
          `(prompt=${data.usage?.prompt_tokens ?? "?"} completion=${data.usage?.completion_tokens ?? "?"})`,
      );
      if (choice.finish_reason === "length") {
        console.warn(
          "[groq] response was truncated by max_tokens before finishing — likely lost a tool call. " +
            "Consider raising maxTokens or lowering reasoning_effort further.",
        );
      }
      return { message: choice.message, finishReason: choice.finish_reason };
    }

    if (res.status === 400) {
      const body = await res.text();

      if (includeReasoningEffort) {
        console.warn(`[groq] request with reasoning_effort was rejected (${body.slice(0, 300)}) — retrying without it.`);
        includeReasoningEffort = false;
        continue;
      }

      const mismatch = parseToolChoiceMismatch(body);
      if (mismatch) {
        console.warn(
          `[groq] forced tool_choice mismatch: model wanted to call "${mismatch.name}" instead — surfacing for recovery.`,
        );
        throw new ToolChoiceMismatchError(`Tool choice mismatch: ${body.slice(0, 300)}`, mismatch.name, mismatch.args);
      }

      throw new GroqError(`Groq API error 400: ${body.slice(0, 500)}`);
    }

    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt;
      await sleep(retryAfter * 1000);
      lastError = new GroqError(`Rate limited (attempt ${attempt}/${MAX_ATTEMPTS})`);
      continue;
    }

    if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
      await sleep(1000 * attempt);
      lastError = new GroqError(`Groq ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS})`);
      continue;
    }

    const body = await res.text();
    throw new GroqError(`Groq API error ${res.status}: ${body.slice(0, 500)}`);
  }

  throw lastError ?? new GroqError("Groq call failed after retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
