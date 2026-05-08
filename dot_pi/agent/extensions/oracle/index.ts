import type { AgentToolResult, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const ORACLE_MODEL = "openai-codex/gpt-5.5";
const ORACLE_THINKING = "xhigh";
const ORACLE_TOOLS = "read,grep,find,ls";
const ORACLE_TIMEOUT_MS = 180_000;

function buildOraclePrompt(question: string, extraContext?: string): string {
  return `You are Oracle, a read-only analysis subagent.

Rules:
- Answer the user's question using only read-only inspection.
- You may use read, grep, find, and ls tools.
- Do not edit, write, delete, move, install, run bash, commit, or mutate state.
- Prefer concrete evidence from files and cite paths when useful.
- If the question cannot be answered confidently with read-only access, say what is missing.
- Be concise and direct.

${extraContext ? `Additional context from caller:\n${extraContext}\n\n` : ""}Question:\n${question}`;
}

async function askOracle(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  question: string,
  extraContext?: string,
): Promise<AgentToolResult<{ model: string; tools: string[]; stdout: string; stderr?: string }>> {
  const trimmed = question.trim();
  if (!trimmed) {
    return {
      isError: true,
      content: [{ type: "text", text: "oracle question must not be empty" }],
      details: { model: ORACLE_MODEL, tools: ORACLE_TOOLS.split(","), stdout: "" },
    };
  }

  const result = await pi.exec(
    "pi",
    [
      "--model",
      ORACLE_MODEL,
      "--thinking",
      ORACLE_THINKING,
      "--tools",
      ORACLE_TOOLS,
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-session",
      "-p",
      buildOraclePrompt(trimmed, extraContext),
    ],
    { cwd: ctx.cwd, signal: ctx.signal, timeout: ORACLE_TIMEOUT_MS },
  );

  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  if (result.code !== 0) {
    const message = stderr || stdout || `oracle exited with code ${result.code}`;
    return {
      isError: true,
      content: [{ type: "text", text: message }],
      details: { model: ORACLE_MODEL, tools: ORACLE_TOOLS.split(","), stdout, stderr },
    };
  }

  return {
    content: [{ type: "text", text: stdout || "Oracle returned no output." }],
    details: { model: ORACLE_MODEL, tools: ORACLE_TOOLS.split(","), stdout, stderr: stderr || undefined },
  };
}

export default function oracle(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "oracle",
    label: "Oracle",
    description: "Ask a read-only oracle subagent a question. The oracle runs in a separate Pi process pinned to GPT-5.5 with only read, grep, find, and ls tools.",
    promptSnippet: "Ask a read-only GPT-5.5 oracle subagent for independent analysis.",
    promptGuidelines: [
      "Use oracle when independent read-only analysis would help answer a question or validate an approach.",
      "Do not use oracle for tasks that require editing, running commands, installing packages, or mutating state.",
    ],
    parameters: Type.Object({
      question: Type.String({ description: "The question for the read-only oracle subagent." }),
      context: Type.Optional(Type.String({ description: "Optional extra context to provide to the oracle." })),
    }),
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: "text", text: `Asking oracle (${ORACLE_MODEL}:${ORACLE_THINKING}, tools: ${ORACLE_TOOLS})...` }] });
      return askOracle(pi, ctx, params.question, params.context);
    },
  });

  pi.registerCommand("oracle", {
    description: "Ask a read-only GPT-5.5 oracle subagent a question",
    handler: async (args, ctx) => {
      const question = args.trim();
      if (!question) {
        ctx.ui.notify("Usage: /oracle <question>", "info");
        return;
      }

      ctx.ui.notify(`Asking oracle (${ORACLE_MODEL}:${ORACLE_THINKING})...`, "info");
      const result = await askOracle(pi, ctx, question);
      const text = result.content.map((part) => (part.type === "text" ? part.text : "[image]")).join("\n");
      if (result.isError) {
        ctx.ui.notify(`Oracle failed: ${text}`, "error");
      } else {
        pi.sendMessage(
          {
            customType: "oracle",
            content: `Oracle (${ORACLE_MODEL}:${ORACLE_THINKING}, read-only) answered:\n\n${text}`,
            display: true,
            details: result.details,
          },
          { deliverAs: "nextTurn" },
        );
      }
    },
  });
}
