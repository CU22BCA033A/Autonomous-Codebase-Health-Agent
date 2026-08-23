import { query } from "@anthropic-ai/claude-agent-sdk";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { AuditLog } from "../auditLog.js";

export interface SubagentSpec {
  /** Short name used in console narration and the audit log. */
  name: string;
  systemPrompt: string;
  userPrompt: string;
  cwd: string;
  tools: string[];
  mcpServers?: Record<string, McpServerConfig>;
  outputSchema: Record<string, unknown>;
  auditLog: AuditLog;
  /** Verbose per-message narration to stdout. Default true. */
  narrate?: boolean;
}

export class SubagentError extends Error {
  constructor(
    message: string,
    public readonly subagent: string,
  ) {
    super(message);
  }
}

/**
 * Runs one subagent to completion as a single, scoped `query()` call — a
 * real Claude Agent SDK agent loop (tools, context management) rather than
 * a hand-rolled prompt-and-parse. Each subagent is its own call rather than
 * a Task-tool dispatch from one long-lived orchestrator conversation, which
 * keeps dispatch order deterministic and each specialist's tool grants
 * least-privilege and independently testable — see orchestrator.ts.
 */
export async function runSubagent<T>(spec: SubagentSpec): Promise<T> {
  const narrate = spec.narrate ?? true;
  const label = `[${spec.name}]`;

  const q = query({
    prompt: spec.userPrompt,
    options: {
      cwd: spec.cwd,
      systemPrompt: spec.systemPrompt,
      tools: spec.tools,
      mcpServers: spec.mcpServers,
      outputFormat: { type: "json_schema", schema: spec.outputSchema },
      // Least-privilege: only the tools this subagent needs are even
      // available (`tools`), and all of them are pre-approved so a
      // headless run never blocks on a permission prompt nobody is
      // watching (`allowedTools`). No bypassPermissions/skip-permissions
      // flag needed — and it can't be used here anyway, since the SDK
      // refuses that mode when the host process runs as root.
      allowedTools: spec.tools,
      hooks: spec.auditLog.forSubagent(spec.name),
      includePartialMessages: false,
    },
  });

  let structuredOutput: unknown;
  let sawResult = false;
  let resultIsError = false;
  let resultText = "";

  for await (const message of q) {
    if (message.type === "assistant") {
      if (!narrate) continue;
      for (const block of message.message.content) {
        if (block.type === "text" && block.text.trim()) {
          for (const line of block.text.trim().split("\n")) {
            console.log(`${label} ${line}`);
          }
        } else if (block.type === "tool_use") {
          console.log(`${label} → ${block.name}(${summarizeInput(block.input)})`);
        }
      }
    } else if (message.type === "result") {
      sawResult = true;
      resultIsError = message.subtype !== "success" || message.is_error;
      if (message.subtype === "success") {
        structuredOutput = message.structured_output;
        resultText = message.result;
      } else {
        resultText = message.subtype;
      }
    }
  }

  if (!sawResult) {
    throw new SubagentError(`${spec.name}: query ended with no result message`, spec.name);
  }
  if (resultIsError) {
    throw new SubagentError(`${spec.name}: run failed — ${resultText}`, spec.name);
  }
  if (structuredOutput === undefined) {
    throw new SubagentError(
      `${spec.name}: no structured_output returned (check outputFormat schema)`,
      spec.name,
    );
  }

  return structuredOutput as T;
}

function summarizeInput(input: unknown): string {
  const s = JSON.stringify(input);
  if (!s) return "";
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}
