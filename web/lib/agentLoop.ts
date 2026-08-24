import { groqChat, GroqError, type GroqMessage, type GroqToolDef } from "./groq";

export interface ToolSpec {
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

export interface AgentLoopSpec<T> {
  /** Narration prefix for server-side logs (Vercel function logs). */
  name: string;
  systemPrompt: string;
  userPrompt: string;
  tools: Record<string, ToolSpec>;
  /** JSON schema for the final answer. The loop forces a call shaped to this. */
  submitSchema: Record<string, unknown>;
  maxIterations?: number;
  maxToolResultChars?: number;
}

const SUBMIT_TOOL_NAME = "submit_result";

/**
 * A minimal hand-rolled agent loop, standing in for what the Claude Agent
 * SDK's query() gives for free (agent loop, tool dispatch, structured
 * output). Rebuilt here because the SDK is Claude/Anthropic-only and this
 * app runs on Groq's free tier instead — see README.md for why.
 *
 * Structured output is extracted the same way the SDK's outputFormat does
 * conceptually, but implemented via a forced tool call: the model must
 * call `submit_result` (shaped to submitSchema) to finish. This is more
 * reliable than asking a smaller open model to emit bare JSON in prose.
 */
export async function runAgentLoop<T>(spec: AgentLoopSpec<T>): Promise<T> {
  const maxIterations = spec.maxIterations ?? 6;
  // Every prior message (including every past tool result) gets resent on
  // every subsequent call — cost compounds with iteration count, not flat
  // per-call. Keeping this tight matters more than it looks like it should.
  const maxToolResultChars = spec.maxToolResultChars ?? 1400;

  const toolDefs: GroqToolDef[] = [
    ...Object.entries(spec.tools).map(([name, t]) => ({
      type: "function" as const,
      function: { name, description: t.description, parameters: t.parameters },
    })),
    {
      type: "function",
      function: {
        name: SUBMIT_TOOL_NAME,
        description: "Call this exactly once, when you have your final answer, instead of any other tool.",
        parameters: spec.submitSchema,
      },
    },
  ];

  const messages: GroqMessage[] = [
    { role: "system", content: spec.systemPrompt },
    { role: "user", content: spec.userPrompt },
  ];

  for (let iter = 1; iter <= maxIterations; iter++) {
    const forceSubmit = iter === maxIterations;
    const { message, finishReason } = await groqChat(messages, {
      tools: toolDefs,
      toolChoice: forceSubmit ? { type: "function", function: { name: SUBMIT_TOOL_NAME } } : "auto",
      maxTokens: 2048,
    });
    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      // Model replied with plain text instead of calling a tool (or got cut
      // off mid-thought by finish_reason:"length" before reaching one).
      // Nudge it accordingly rather than repeating the same generic prompt,
      // which just burns another iteration on more of the same.
      const truncated = finishReason === "length";
      messages.push({
        role: "user",
        content: truncated
          ? `Your last response was cut off before finishing. Stop reasoning and call the ${SUBMIT_TOOL_NAME} tool (or another tool) right now — be terse.`
          : `Call the ${SUBMIT_TOOL_NAME} tool with your final answer now, or another tool if you need more information first.`,
      });
      continue;
    }

    for (const call of message.tool_calls) {
      if (call.function.name === SUBMIT_TOOL_NAME) {
        const parsed = safeParseJson(call.function.arguments);
        if (parsed.ok) {
          console.log(`[${spec.name}] submitted result after ${iter} iteration(s)`);
          return parsed.value as T;
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `Your arguments were not valid JSON: ${parsed.error}. Call ${SUBMIT_TOOL_NAME} again with valid JSON matching the schema.`,
        });
        continue;
      }

      const tool = spec.tools[call.function.name];
      if (!tool) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `Unknown tool "${call.function.name}". Available tools: ${Object.keys(spec.tools).join(", ")}, ${SUBMIT_TOOL_NAME}.`,
        });
        continue;
      }

      const parsedArgs = safeParseJson(call.function.arguments);
      if (!parsedArgs.ok) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `Invalid JSON arguments: ${parsedArgs.error}`,
        });
        continue;
      }

      console.log(`[${spec.name}] -> ${call.function.name}(${JSON.stringify(parsedArgs.value).slice(0, 150)})`);
      let result: string;
      try {
        result = await tool.handler(parsedArgs.value as Record<string, unknown>);
      } catch (err) {
        result = `Tool failed: ${(err as Error).message}`;
      }
      if (result.length > maxToolResultChars) {
        result = `${result.slice(0, maxToolResultChars)}\n…(truncated, ${result.length} chars total)`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  throw new GroqError(`${spec.name}: exceeded ${maxIterations} iterations without a final answer`);
}

function safeParseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
