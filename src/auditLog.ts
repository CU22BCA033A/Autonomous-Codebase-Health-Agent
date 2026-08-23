import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  HookCallbackMatcher,
  HookInput,
} from "@anthropic-ai/claude-agent-sdk";

/**
 * §5: "Full audit trail via SDK hooks — log every tool call (what was read,
 * what was queried, what was decided and why) at each step of the agent
 * lifecycle. This is a safety feature and the direct data source for the
 * dashboard's reasoning-trail view — build it once, use it twice."
 *
 * One AuditLog instance per scan run. Each subagent invocation registers
 * itself with `forSubagent(name)` before calling query(), so every entry is
 * attributable to the specific specialist that produced it.
 */
export interface AuditEntry {
  timestamp: string;
  subagent: string;
  event: "PreToolUse" | "PostToolUse";
  toolName: string;
  toolInput?: unknown;
  toolResponseSummary?: string;
}

function summarize(value: unknown, max = 400): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export class AuditLog {
  private entries: AuditEntry[] = [];

  /** Hooks scoped to one subagent's query() call. */
  forSubagent(subagent: string): Partial<Record<"PreToolUse" | "PostToolUse", HookCallbackMatcher[]>> {
    return {
      PreToolUse: [
        {
          hooks: [
            async (input: HookInput) => {
              if (input.hook_event_name !== "PreToolUse") return {};
              this.entries.push({
                timestamp: new Date().toISOString(),
                subagent,
                event: "PreToolUse",
                toolName: input.tool_name,
                toolInput: input.tool_input,
              });
              return {};
            },
          ],
        },
      ],
      PostToolUse: [
        {
          hooks: [
            async (input: HookInput) => {
              if (input.hook_event_name !== "PostToolUse") return {};
              this.entries.push({
                timestamp: new Date().toISOString(),
                subagent,
                event: "PostToolUse",
                toolName: input.tool_name,
                toolResponseSummary: summarize(input.tool_response),
              });
              return {};
            },
          ],
        },
      ],
    };
  }

  all(): AuditEntry[] {
    return this.entries;
  }

  async writeTo(runDir: string): Promise<string> {
    await mkdir(runDir, { recursive: true });
    const file = path.join(runDir, "audit-log.json");
    await writeFile(file, JSON.stringify(this.entries, null, 2), "utf8");
    return file;
  }
}
