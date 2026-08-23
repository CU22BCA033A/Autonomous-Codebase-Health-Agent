/**
 * Thin client for Groq's OpenAI-compatible chat completions API. Groq's
 * free tier (no credit card, https://console.groq.com) is the whole reason
 * this app can run at zero cost — in exchange it's rate-limited (as of
 * writing: 30 requests/min, 6,000 tokens/min, 14,400 requests/day per org
 * on llama-3.3-70b-versatile). Every call here respects that: 429s get a
 * bounded retry with backoff instead of hammering the API, and callers
 * (agentLoop.ts) are responsible for keeping prompts and tool results lean
 * so a single scan doesn't blow the per-minute token budget.
 */

const GROQ_API = "https://api.groq.com/openai/v1";
// llama-3.3-70b-versatile was deprecated by Groq (June 2026); their
// recommended replacement for tool-calling/agentic use is gpt-oss-120b.
export const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

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

interface GroqChatResponse {
  choices: Array<{
    message: GroqMessage;
    finish_reason: string;
  }>;
  usage?: { total_tokens: number };
}

export class GroqError extends Error {}

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
): Promise<GroqMessage> {
  const MAX_ATTEMPTS = 4;
  let lastError: Error | undefined;

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
        max_tokens: opts.maxTokens ?? 1024,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as GroqChatResponse;
      const choice = data.choices[0];
      if (!choice) throw new GroqError("Groq returned no choices");
      return choice.message;
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
