import type { AgentToolResult, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { query } from "@anthropic-ai/claude-agent-sdk";

const CLAUDE_TOOLS_LABEL = "all Claude Code tools";
const CLAUDE_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_TURNS = 8;
const DEFAULT_EFFORT = "xhigh";

type ClaudeDetails = {
  model?: string;
  effort: string;
  tools: string;
  permissionMode: "auto";
  sessionId?: string;
  result: string;
};

function buildClaudePrompt(question: string, extraContext?: string): string {
  return `You are Claude, a full-capability coding subagent called from Pi.

Rules:
- You may use the available Claude Code tools to complete the request.
- Be careful with destructive operations and explain important changes.
- Prefer concrete evidence from files and cite paths when useful.
- Be concise and direct.

${extraContext ? `Additional context from caller:\n${extraContext}\n\n` : ""}Question:\n${question}`;
}

function textFromAssistantMessage(message: any): string {
  const content = message?.message?.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part?.type === "text" && typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function makeAbortController(signal?: AbortSignal): AbortController {
  const controller = new AbortController();
  if (signal?.aborted) {
    controller.abort(signal.reason);
    return controller;
  }
  signal?.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  return controller;
}

async function askClaude(
  ctx: ExtensionContext,
  question: string,
  extraContext?: string,
  maxTurns = DEFAULT_MAX_TURNS,
): Promise<AgentToolResult<ClaudeDetails>> {
  const trimmed = question.trim();
  if (!trimmed) {
    return {
      isError: true,
      content: [{ type: "text", text: "claude question must not be empty" }],
      details: { effort: DEFAULT_EFFORT, tools: CLAUDE_TOOLS_LABEL, permissionMode: "auto", result: "" },
    };
  }

  const abortController = makeAbortController(ctx.signal);
  const timeout = setTimeout(() => abortController.abort(new Error("claude timed out")), CLAUDE_TIMEOUT_MS);

  let sessionId: string | undefined;
  let model: string | undefined;
  let resultText = "";
  let lastAssistantText = "";

  try {
    for await (const message of query({
      prompt: buildClaudePrompt(trimmed, extraContext),
      options: {
        abortController,
        cwd: ctx.cwd,
        effort: DEFAULT_EFFORT,
        maxTurns,
        permissionMode: "auto",
      },
    })) {
      if ((message as any).type === "system" && (message as any).subtype === "init") {
        sessionId = (message as any).session_id;
        model = (message as any).model;
      } else if ((message as any).type === "assistant") {
        lastAssistantText = textFromAssistantMessage(message) || lastAssistantText;
        model = (message as any).message?.model || model;
      } else if (typeof (message as any).result === "string") {
        resultText = (message as any).result.trim();
        sessionId = (message as any).session_id || sessionId;
      }
    }
  } catch (error: any) {
    const text = error?.message || String(error);
    return {
      isError: true,
      content: [{ type: "text", text: `Claude failed: ${text}` }],
      details: {
        model,
        effort: DEFAULT_EFFORT,
        tools: CLAUDE_TOOLS_LABEL,
        permissionMode: "auto",
        sessionId,
        result: resultText || lastAssistantText,
      },
    };
  } finally {
    clearTimeout(timeout);
  }

  const finalText = resultText || lastAssistantText || "Claude returned no output.";
  return {
    content: [{ type: "text", text: finalText }],
    details: {
      model,
      effort: DEFAULT_EFFORT,
      tools: CLAUDE_TOOLS_LABEL,
      permissionMode: "auto",
      sessionId,
      result: finalText,
    },
  };
}

export default function claude(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "claude",
    label: "Claude",
    description: "Ask Claude as a coding subagent through the Claude Agent SDK with auto permission review.",
    promptSnippet: "Ask Claude for independent coding analysis or implementation help.",
    promptGuidelines: [
      "Use claude when independent analysis or implementation by Claude would help answer a question or complete a task.",
      "Claude has full Claude Code tool access, with tool calls routed through Claude Code's auto permission mode.",
    ],
    parameters: Type.Object({
      question: Type.String({ description: "The question for the Claude subagent." }),
      context: Type.Optional(Type.String({ description: "Optional extra context to provide to Claude." })),
      maxTurns: Type.Optional(Type.Number({ description: "Maximum Claude tool-use turns. Defaults to 8." })),
    }),
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: "text", text: `Asking Claude (${DEFAULT_EFFORT}, ${CLAUDE_TOOLS_LABEL})...` }] });
      return askClaude(ctx, params.question, params.context, params.maxTurns);
    },
  });

  pi.registerCommand("claude", {
    description: "Ask Claude as a coding subagent with auto permission review",
    handler: async (args, ctx) => {
      const question = args.trim();
      if (!question) {
        ctx.ui.notify("Usage: /claude <question>", "info");
        return;
      }

      ctx.ui.notify(`Asking Claude (${DEFAULT_EFFORT}, ${CLAUDE_TOOLS_LABEL})...`, "info");
      const result = await askClaude(ctx, question);
      const text = result.content.map((part) => (part.type === "text" ? part.text : "[image]")).join("\n");
      if (result.isError) {
        ctx.ui.notify(text, "error");
      } else {
        pi.sendMessage(
          {
            customType: "claude",
            content: `Claude (${result.details?.model ?? "default"}, ${DEFAULT_EFFORT}, ${CLAUDE_TOOLS_LABEL}) answered:\n\n${text}`,
            display: true,
            details: result.details,
          },
          { deliverAs: "nextTurn" },
        );
      }
    },
  });
}
