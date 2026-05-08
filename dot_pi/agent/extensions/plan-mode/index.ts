import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";
import { extractTodoItems, isSafeCommand, markCompletedSteps, type TodoItem } from "./utils.js";

const PREFERRED_PLAN_TOOLS = ["read", "bash", "grep", "find", "ls", "questionnaire", "question"];
const DEFAULT_NORMAL_TOOLS = ["read", "bash", "edit", "write"];

interface PlanModeState {
  enabled: boolean;
  executing: boolean;
  todos: TodoItem[];
  previousTools?: string[];
}

type PiMode = {
  name: string;
  label: string;
  isActive(): boolean;
  enter(ctx: ExtensionContext): void | Promise<void>;
  exit(ctx: ExtensionContext): void | Promise<void>;
};

function registerMode(mode: PiMode): void {
  const global = globalThis as typeof globalThis & { __piModeRegistry?: { modes: Map<string, PiMode> } };
  global.__piModeRegistry ??= { modes: new Map() };
  global.__piModeRegistry.modes.set(mode.name, mode);
}

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return message.role === "assistant" && Array.isArray(message.content);
}

function getTextContent(message: AssistantMessage): string {
  return message.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export default function planModeExtension(pi: ExtensionAPI): void {
  let planModeEnabled = false;
  let executionMode = false;
  let todoItems: TodoItem[] = [];
  let previousTools: string[] | undefined;

  pi.registerFlag("plan", {
    description: "Start in plan mode (read-only exploration)",
    type: "boolean",
    default: false,
  });

  function allToolNames(): string[] {
    return pi.getAllTools().map((tool) => tool.name);
  }

  function availablePlanTools(): string[] {
    const available = new Set(allToolNames());
    return PREFERRED_PLAN_TOOLS.filter((name) => available.has(name));
  }

  function fallbackNormalTools(): string[] {
    const available = new Set(allToolNames());
    const defaultTools = DEFAULT_NORMAL_TOOLS.filter((name) => available.has(name));
    return defaultTools.length > 0 ? defaultTools : allToolNames();
  }

  function restoreNormalTools(): void {
    const available = new Set(allToolNames());
    const tools = (previousTools ?? fallbackNormalTools()).filter((name) => available.has(name));
    pi.setActiveTools(tools.length > 0 ? tools : fallbackNormalTools());
    previousTools = undefined;
  }

  function enterPlanMode(ctx?: ExtensionContext): void {
    if (!planModeEnabled && !previousTools) {
      previousTools = pi.getActiveTools();
    }
    planModeEnabled = true;
    executionMode = false;
    todoItems = [];
    const tools = availablePlanTools();
    pi.setActiveTools(tools);
    if (ctx) {
      ctx.ui.notify(`Plan mode enabled. Tools: ${tools.join(", ") || "none"}`, "info");
      updateStatus(ctx);
    }
    persistState();
  }

  function exitPlanMode(ctx?: ExtensionContext): void {
    planModeEnabled = false;
    executionMode = false;
    todoItems = [];
    restoreNormalTools();
    if (ctx) {
      ctx.ui.notify("Plan mode disabled. Tool access restored.", "info");
      updateStatus(ctx);
    }
    persistState();
  }

  function beginExecution(ctx: ExtensionContext): void {
    planModeEnabled = false;
    executionMode = todoItems.length > 0;
    restoreNormalTools();
    updateStatus(ctx);
    persistState();
  }

  function updateStatus(ctx: ExtensionContext): void {
    if (executionMode && todoItems.length > 0) {
      const completed = todoItems.filter((item) => item.completed).length;
      ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("accent", `📋 ${completed}/${todoItems.length}`));
    } else if (planModeEnabled) {
      ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "⏸ plan"));
    } else {
      ctx.ui.setStatus("plan-mode", undefined);
    }

    if (executionMode && todoItems.length > 0) {
      const lines = todoItems.map((item) => {
        if (item.completed) {
          return ctx.ui.theme.fg("success", "☑ ") + ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(item.text));
        }
        return `${ctx.ui.theme.fg("muted", "☐ ")}${item.text}`;
      });
      ctx.ui.setWidget("plan-todos", lines);
    } else {
      ctx.ui.setWidget("plan-todos", undefined);
    }
  }

  function persistState(): void {
    pi.appendEntry<PlanModeState>("plan-mode", {
      enabled: planModeEnabled,
      executing: executionMode,
      todos: todoItems,
      previousTools,
    });
  }

  registerMode({
    name: "plan",
    label: "plan",
    isActive: () => planModeEnabled || executionMode,
    enter: enterPlanMode,
    exit: exitPlanMode,
  });

  pi.registerCommand("plan", {
    description: "Toggle plan mode (read-only exploration)",
    handler: (_args, ctx) =>
      Effect.runPromise(
        Effect.sync(() => {
          if (planModeEnabled || executionMode) exitPlanMode(ctx);
          else enterPlanMode(ctx);
        }),
      ),
  });

  pi.registerCommand("todos", {
    description: "Show current plan progress",
    handler: (_args, ctx) =>
      Effect.runPromise(
        Effect.sync(() => {
          if (todoItems.length === 0) {
            ctx.ui.notify("No plan todos yet. Enable /plan and ask for a numbered Plan: first.", "info");
            return;
          }
          const list = todoItems.map((item) => `${item.step}. ${item.completed ? "✓" : "○"} ${item.text}`).join("\n");
          ctx.ui.notify(`Plan Progress:\n${list}`, "info");
        }),
      ),
  });

  pi.registerShortcut("ctrl+alt+p", {
    description: "Toggle plan mode",
    handler: (ctx) =>
      Effect.runPromise(
        Effect.sync(() => {
          if (planModeEnabled || executionMode) exitPlanMode(ctx);
          else enterPlanMode(ctx);
        }),
      ),
  });

  pi.on("tool_call", (event) =>
    Effect.runPromise(
      Effect.sync(() => {
        if (!planModeEnabled || event.toolName !== "bash") return;

        const command = String((event.input as { command?: unknown }).command ?? "");
        if (!isSafeCommand(command)) {
          return {
            block: true,
            reason: `Plan mode blocked this bash command because it is not read-only/allowlisted. Disable plan mode with /plan if you really want to run it.\nCommand: ${command}`,
          };
        }
      }),
    ),
  );

  pi.on("context", (event) =>
    Effect.runPromise(
      Effect.sync(() => {
        if (planModeEnabled || executionMode) return;

        return {
          messages: event.messages.filter((message) => {
            const maybeCustom = message as AgentMessage & { customType?: string };
            return maybeCustom.customType !== "plan-mode-context" && maybeCustom.customType !== "plan-execution-context";
          }),
        };
      }),
    ),
  );

  pi.on("before_agent_start", () => Effect.runPromise(Effect.sync(() => {
    if (planModeEnabled) {
      const tools = availablePlanTools();
      const questionInstruction = tools.includes("questionnaire") || tools.includes("question")
        ? "Ask clarifying questions with the available question tool when useful."
        : "Ask clarifying questions in your response when useful.";

      return {
        message: {
          customType: "plan-mode-context",
          content: `[PLAN MODE ACTIVE]\nYou are in read-only planning mode.\n\nRestrictions:\n- You can only use these tools: ${tools.join(", ") || "none"}\n- Do not edit, write, create, delete, move, or modify files.\n- Bash is restricted to read-only allowlisted commands.\n\n${questionInstruction}\nExplore the codebase and produce a concrete numbered plan under an exact "Plan:" header:\n\nPlan:\n1. First step\n2. Second step\n\nDo not execute the plan until the user confirms.`,
          display: false,
        },
      };
    }

    if (executionMode && todoItems.length > 0) {
      const remaining = todoItems.filter((item) => !item.completed).map((item) => `${item.step}. ${item.text}`).join("\n");
      return {
        message: {
          customType: "plan-execution-context",
          content: `[EXECUTING PLAN]\nFull tool access is restored. Execute the remaining steps in order.\n\nRemaining steps:\n${remaining}\n\nAfter completing a step, include a [DONE:n] tag in your response.`,
          display: false,
        },
      };
    }
  })));

  pi.on("turn_end", (event, ctx) => Effect.runPromise(Effect.sync(() => {
    if (!executionMode || todoItems.length === 0) return;
    if (!isAssistantMessage(event.message)) return;

    if (markCompletedSteps(getTextContent(event.message), todoItems) > 0) {
      updateStatus(ctx);
    }
    persistState();
  })));

  pi.on("agent_end", async (event, ctx) => {
    if (executionMode && todoItems.length > 0) {
      if (todoItems.every((item) => item.completed)) {
        const completedList = todoItems.map((item) => `~~${item.text}~~`).join("\n");
        pi.sendMessage(
          { customType: "plan-complete", content: `**Plan complete!** ✓\n\n${completedList}`, display: true },
          { triggerTurn: false },
        );
        executionMode = false;
        todoItems = [];
        updateStatus(ctx);
        persistState();
      }
      return;
    }

    if (!planModeEnabled || !ctx.hasUI) return;

    const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
    if (lastAssistant) {
      const extracted = extractTodoItems(getTextContent(lastAssistant));
      if (extracted.length > 0) todoItems = extracted;
    }

    if (todoItems.length > 0) {
      const todoListText = todoItems.map((item) => `${item.step}. ☐ ${item.text}`).join("\n");
      pi.sendMessage(
        { customType: "plan-todo-list", content: `**Plan Steps (${todoItems.length}):**\n\n${todoListText}`, display: true },
        { triggerTurn: false },
      );
    }

    const choice = await ctx.ui.select("Plan mode - what next?", [
      todoItems.length > 0 ? "Execute the plan (track progress)" : "Execute the plan",
      "Stay in plan mode",
      "Refine the plan",
      "Exit plan mode",
    ]);

    if (choice?.startsWith("Execute")) {
      beginExecution(ctx);
      const execMessage = todoItems.length > 0
        ? `Execute the plan. Start with step 1: ${todoItems[0].text}`
        : "Execute the plan you just created.";
      pi.sendMessage({ customType: "plan-mode-execute", content: execMessage, display: true }, { triggerTurn: true });
    } else if (choice === "Refine the plan") {
      const refinement = await ctx.ui.editor("Refine the plan:", "");
      if (refinement?.trim()) pi.sendUserMessage(refinement.trim());
    } else if (choice === "Exit plan mode") {
      exitPlanMode(ctx);
    } else {
      updateStatus(ctx);
      persistState();
    }
  });

  pi.on("session_start", (_event, ctx) => Effect.runPromise(Effect.sync(() => {
    const entries = ctx.sessionManager.getEntries();
    const stateEntry = entries
      .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === "plan-mode")
      .pop() as { data?: PlanModeState } | undefined;

    if (stateEntry?.data) {
      planModeEnabled = stateEntry.data.enabled ?? false;
      executionMode = stateEntry.data.executing ?? false;
      todoItems = stateEntry.data.todos ?? [];
      previousTools = stateEntry.data.previousTools;
    }

    if (pi.getFlag("plan") === true) {
      if (!previousTools) previousTools = pi.getActiveTools();
      planModeEnabled = true;
      executionMode = false;
    }

    if (executionMode && todoItems.length > 0) {
      let executeIndex = -1;
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i] as { customType?: string };
        if (entry.customType === "plan-mode-execute") {
          executeIndex = i;
          break;
        }
      }

      const assistantMessages: AssistantMessage[] = [];
      for (let i = executeIndex + 1; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.type === "message" && "message" in entry && isAssistantMessage(entry.message as AgentMessage)) {
          assistantMessages.push(entry.message as AssistantMessage);
        }
      }
      markCompletedSteps(assistantMessages.map(getTextContent).join("\n"), todoItems);
    }

    if (planModeEnabled) {
      pi.setActiveTools(availablePlanTools());
    }
    updateStatus(ctx);
  })));
}
