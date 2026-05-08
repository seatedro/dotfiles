import type { AgentToolResult, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Effect, pipe } from "effect";
import { Type } from "typebox";
import { query } from "@anthropic-ai/claude-agent-sdk";

const CLAUDE_TOOLS_LABEL = "all Claude Code tools";
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

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;

function textFromAssistantMessage(message: unknown): string {
  const outer = asRecord(message);
  const inner = asRecord(outer?.message);
  const content = inner?.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      const block = asRecord(part);
      return block?.type === "text" && typeof block.text === "string" ? block.text : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

const errorMessage = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

function makeAbortController(signal?: AbortSignal): AbortController {
  const controller = new AbortController();
  if (signal?.aborted) {
    controller.abort(signal.reason);
    return controller;
  }
  signal?.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  return controller;
}

async function collectClaudeResult(
  ctx: ExtensionContext,
  trimmed: string,
  extraContext: string | undefined,
  maxTurns: number,
): Promise<AgentToolResult<ClaudeDetails>> {
  const abortController = makeAbortController(ctx.signal);

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
      const record = asRecord(message);
      const nestedMessage = asRecord(record?.message);
      if (record?.type === "system" && record.subtype === "init") {
        sessionId = typeof record.session_id === "string" ? record.session_id : sessionId;
        model = typeof record.model === "string" ? record.model : model;
      } else if (record?.type === "assistant") {
        lastAssistantText = textFromAssistantMessage(message) || lastAssistantText;
        model = typeof nestedMessage?.model === "string" ? nestedMessage.model : model;
      } else if (typeof record?.result === "string") {
        resultText = record.result.trim();
        sessionId = typeof record.session_id === "string" ? record.session_id : sessionId;
      }
    }
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: `Claude failed: ${errorMessage(error)}` }],
      details: {
        model,
        effort: DEFAULT_EFFORT,
        tools: CLAUDE_TOOLS_LABEL,
        permissionMode: "auto",
        sessionId,
        result: resultText || lastAssistantText,
      },
    };
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

const emptyClaudeQuestion = (): AgentToolResult<ClaudeDetails> => ({
  isError: true,
  content: [{ type: "text", text: "claude question must not be empty" }],
  details: { effort: DEFAULT_EFFORT, tools: CLAUDE_TOOLS_LABEL, permissionMode: "auto", result: "" },
});

const askClaudeEffect = (
  ctx: ExtensionContext,
  question: string,
  extraContext?: string,
  maxTurns = DEFAULT_MAX_TURNS,
): Effect.Effect<AgentToolResult<ClaudeDetails>, never> => {
  const trimmed = question.trim();
  if (!trimmed) return Effect.succeed(emptyClaudeQuestion());
  return pipe(
    Effect.tryPromise({
      try: () => collectClaudeResult(ctx, trimmed, extraContext, maxTurns),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    }),
    Effect.catchAll((error) =>
      Effect.succeed({
        isError: true,
        content: [{ type: "text", text: `Claude failed: ${error.message}` }],
        details: { effort: DEFAULT_EFFORT, tools: CLAUDE_TOOLS_LABEL, permissionMode: "auto", result: "" },
      }),
    ),
  );
};

function askClaude(
  ctx: ExtensionContext,
  question: string,
  extraContext?: string,
  maxTurns = DEFAULT_MAX_TURNS,
): Promise<AgentToolResult<ClaudeDetails>> {
  return Effect.runPromise(askClaudeEffect(ctx, question, extraContext, maxTurns));
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
