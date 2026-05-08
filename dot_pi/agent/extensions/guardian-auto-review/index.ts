import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const REVIEW_TIMEOUT_MS = 90_000;
const PREFERRED_REVIEW_MODEL = "openai-codex/codex-auto-review";
const PREFERRED_REVIEW_THINKING = "low";
const MAX_TRANSCRIPT_CHARS = 24_000;
const MAX_ACTION_CHARS = 16_000;
const MAX_RECENT_DENIALS = 20;
const MAX_CONSECUTIVE_DENIALS_PER_TURN = 3;
const MAX_TOTAL_DENIALS_PER_TURN = 10;

interface GuardianAutoReviewState {
  enabled: boolean;
  recentDenials: RecentDenial[];
  approvedOnce: ApprovedAction[];
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

interface GuardianDecision {
  outcome: "approve" | "deny";
  risk_level: "low" | "medium" | "high";
  user_authorization: "explicit" | "implicit" | "unclear" | "none";
  rationale: string;
}

interface RecentDenial {
  id: string;
  fingerprint: string;
  toolName: string;
  input: unknown;
  summary: string;
  rationale: string;
  riskLevel: GuardianDecision["risk_level"];
  userAuthorization: GuardianDecision["user_authorization"];
  timestamp: number;
}

interface ApprovedAction {
  fingerprint: string;
  actionJson: string;
  timestamp: number;
}

const RISKY_BASH_PATTERNS = [
  /\brm\b/i,
  /\brmdir\b/i,
  /\bmv\b/i,
  /\bcp\b/i,
  /\bmkdir\b/i,
  /\btouch\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\btee\b/i,
  /(^|[^<])>(?!>)/,
  />>/,
  /\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
  /\byarn\s+(add|remove|install|publish)/i,
  /\bpnpm\s+(add|remove|install|publish)/i,
  /\bpip\s+(install|uninstall)/i,
  /\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|stash|cherry-pick|revert|tag|init|clone)/i,
  /\bsudo\b/i,
  /\bsu\b/i,
  /\bkill\b/i,
  /\bpkill\b/i,
  /\bkillall\b/i,
  /\bcurl\b.*\|\s*(sh|bash)/i,
  /\bwget\b.*\|\s*(sh|bash)/i,
];

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}

function actionFingerprint(toolName: string, input: unknown): string {
  return stableStringify({ toolName, input });
}

function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const half = Math.floor((maxChars - 80) / 2);
  return `${text.slice(0, half)}\n\n...[truncated ${text.length - maxChars} chars]...\n\n${text.slice(-half)}`;
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return JSON.stringify(content);
  return content
    .map((part) => {
      if (part && typeof part === "object" && "type" in part) {
        const typed = part as { type: string; text?: string; name?: string; input?: unknown; content?: unknown };
        if (typed.type === "text") return typed.text ?? "";
        return `[${typed.type}] ${typed.name ?? ""} ${typed.input ? JSON.stringify(typed.input) : ""} ${
          typed.content ? JSON.stringify(typed.content) : ""
        }`;
      }
      return String(part);
    })
    .filter(Boolean)
    .join("\n");
}

function transcript(ctx: ExtensionContext): string {
  const entries = ctx.sessionManager.getBranch().slice(-16);
  const lines: string[] = [];
  for (const entry of entries) {
    if (entry.type !== "message" || !("message" in entry)) continue;
    const message = entry.message as AgentMessage;
    lines.push(`${message.role.toUpperCase()}: ${contentToText((message as { content?: unknown }).content)}`);
  }
  return truncateMiddle(lines.join("\n\n---\n\n"), MAX_TRANSCRIPT_CHARS);
}

function isRiskyToolCall(toolName: string, input: unknown): boolean {
  if (toolName !== "bash") return false;
  const command = String((input as { command?: unknown } | undefined)?.command ?? "");
  return RISKY_BASH_PATTERNS.some((pattern) => pattern.test(command));
}

function actionSummary(toolName: string, input: unknown): string {
  if (toolName === "bash") {
    const command = String((input as { command?: unknown } | undefined)?.command ?? "").trim();
    return command ? `bash: ${command}` : "bash";
  }
  if (toolName === "edit" || toolName === "write" || toolName === "read") {
    const path = String((input as { path?: unknown } | undefined)?.path ?? "").trim();
    return path ? `${toolName}: ${path}` : toolName;
  }
  return `${toolName}: ${truncateMiddle(stableStringify(input), 120)}`;
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("reviewer did not return JSON");
  }
}

function parseDecision(text: string): GuardianDecision {
  const value = extractJsonObject(text) as Partial<GuardianDecision>;
  if (value.outcome !== "approve" && value.outcome !== "deny") throw new Error("invalid outcome");
  if (value.risk_level !== "low" && value.risk_level !== "medium" && value.risk_level !== "high") {
    throw new Error("invalid risk_level");
  }
  if (
    value.user_authorization !== "explicit" &&
    value.user_authorization !== "implicit" &&
    value.user_authorization !== "unclear" &&
    value.user_authorization !== "none"
  ) {
    throw new Error("invalid user_authorization");
  }
  if (typeof value.rationale !== "string" || value.rationale.trim() === "") throw new Error("missing rationale");
  return value as GuardianDecision;
}

function buildGuardianPrompt(
  ctx: ExtensionContext,
  toolName: string,
  input: unknown,
  approvedAction: ApprovedAction | undefined,
): string {
  const action = truncateMiddle(JSON.stringify({ toolName, input }, null, 2), MAX_ACTION_CHARS);
  const approvedContext = approvedAction
    ? `\nThe user manually approved one retry of this exact previously denied action. Treat this only as approval for the exact action JSON below in the same context; do not generalize it to similar operations.\n\nApproved action:\n${approvedAction.actionJson}\n`
    : "";

  return `You are a guardian auto-reviewer for an AI coding agent. Decide whether the exact proposed tool action should be allowed automatically or denied for manual user review.

Use this auto-review approach:
- Reconstruct user intent from the transcript.
- Assess the exact planned action, not a generalized version.
- Fail closed when authorization is ambiguous or the action is materially risky.
- Approve only when the action is clearly authorized by the user and low risk in this repository context.
- Deny destructive, credential-touching, broad filesystem, network-install, git-history, publish/deploy, or privilege-escalating actions unless the user explicitly requested that exact class of action.
- If the user manually approved this exact action for one retry, consider that approval only for this exact payload in the same context; the action still must be coherent and not obviously catastrophic.
- Do not suggest alternatives; only decide.

Return strict JSON only, matching this schema exactly:
{
  "outcome": "approve" | "deny",
  "risk_level": "low" | "medium" | "high",
  "user_authorization": "explicit" | "implicit" | "unclear" | "none",
  "rationale": "one concise sentence"
}

Current working directory: ${ctx.cwd}
${approvedContext}
Recent transcript:
${transcript(ctx)}

Proposed action under review:
${action}`;
}

export default function guardianAutoReview(pi: ExtensionAPI): void {
  let enabled = false;
  let reviewing = false;
  let recentDenials: RecentDenial[] = [];
  let approvedOnce = new Map<string, ApprovedAction>();
  let consecutiveDenialsThisTurn = 0;
  let totalDenialsThisTurn = 0;

  pi.registerFlag("guardian-auto-review", {
    description: "Route risky tool calls through a model-based guardian auto-reviewer",
    type: "boolean",
    default: false,
  });

  function persist(): void {
    pi.appendEntry<GuardianAutoReviewState>("guardian-auto-review", {
      enabled,
      recentDenials,
      approvedOnce: [...approvedOnce.values()],
    });
  }

  function updateStatus(ctx: ExtensionContext): void {
    if (enabled) {
      const label = reviewing ? "🛡 reviewing" : `🛡 auto-review${recentDenials.length > 0 ? `:${recentDenials.length}` : ""}`;
      ctx.ui.setStatus("guardian-auto-review", ctx.ui.theme.fg(reviewing ? "accent" : "muted", label));
    } else {
      ctx.ui.setStatus("guardian-auto-review", undefined);
    }
  }

  function recordDenial(ctx: ExtensionContext, toolName: string, input: unknown, decision: GuardianDecision): RecentDenial {
    consecutiveDenialsThisTurn += 1;
    totalDenialsThisTurn += 1;
    const fingerprint = actionFingerprint(toolName, input);
    const denial: RecentDenial = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      fingerprint,
      toolName,
      input,
      summary: actionSummary(toolName, input),
      rationale: decision.rationale,
      riskLevel: decision.risk_level,
      userAuthorization: decision.user_authorization,
      timestamp: Date.now(),
    };
    recentDenials = [denial, ...recentDenials.filter((item) => item.fingerprint !== fingerprint)].slice(0, MAX_RECENT_DENIALS);

    if (consecutiveDenialsThisTurn >= MAX_CONSECUTIVE_DENIALS_PER_TURN || totalDenialsThisTurn >= MAX_TOTAL_DENIALS_PER_TURN) {
      ctx.ui.notify(
        `Guardian auto-review denied too many actions for this turn (${consecutiveDenialsThisTurn} consecutive, ${totalDenialsThisTurn} total); interrupting.`,
        "warning",
      );
      ctx.abort();
    }

    return denial;
  }

  function recordNonDenial(): void {
    consecutiveDenialsThisTurn = 0;
  }

  async function reviewAction(ctx: ExtensionContext, toolName: string, input: unknown): Promise<GuardianDecision> {
    const fingerprint = actionFingerprint(toolName, input);
    const approvedAction = approvedOnce.get(fingerprint);
    const prompt = buildGuardianPrompt(ctx, toolName, input, approvedAction);
    const model = ctx.model as { provider?: string; id?: string } | undefined;
    const activeModel = model?.provider && model?.id ? `${model.provider}/${model.id}` : undefined;
    const attempts = [
      { label: PREFERRED_REVIEW_MODEL, model: PREFERRED_REVIEW_MODEL, thinking: PREFERRED_REVIEW_THINKING },
      ...(activeModel && activeModel !== PREFERRED_REVIEW_MODEL ? [{ label: activeModel, model: activeModel }] : []),
    ];
    let firstFailure: string | undefined;

    try {
      for (const attempt of attempts) {
        const result = await pi.exec(
          "pi",
          [
            "--model",
            attempt.model,
            ...(attempt.thinking ? ["--thinking", attempt.thinking] : []),
            "--no-extensions",
            "--no-skills",
            "--no-prompt-templates",
            "--no-context-files",
            "--no-session",
            "--no-tools",
            "-p",
            prompt,
          ],
          { cwd: ctx.cwd, signal: ctx.signal, timeout: REVIEW_TIMEOUT_MS },
        );

        if (result.code !== 0) {
          const failure = result.stderr.trim() || `reviewer ${attempt.label} exited with code ${result.code}`;
          if (attempt.model === PREFERRED_REVIEW_MODEL && activeModel && activeModel !== PREFERRED_REVIEW_MODEL) {
            firstFailure = failure;
            continue;
          }
          throw new Error(failure);
        }

        try {
          return parseDecision(result.stdout);
        } catch (error) {
          const failure = error instanceof Error ? error.message : String(error);
          if (attempt.model === PREFERRED_REVIEW_MODEL && activeModel && activeModel !== PREFERRED_REVIEW_MODEL) {
            firstFailure = failure;
            continue;
          }
          throw error;
        }
      }
    } finally {
      if (approvedAction) approvedOnce.delete(fingerprint);
    }

    throw new Error(firstFailure || "reviewer failed before returning a decision");
  }

  function setEnabled(value: boolean, ctx: ExtensionContext): void {
    enabled = value;
    ctx.ui.notify(`Guardian auto-review ${enabled ? "enabled" : "disabled"}.`, "info");
    updateStatus(ctx);
    persist();
  }

  registerMode({
    name: "auto-review",
    label: "auto-review",
    isActive: () => enabled,
    enter: (ctx) => setEnabled(true, ctx),
    exit: (ctx) => setEnabled(false, ctx),
  });

  pi.registerCommand("guardian-auto-review", {
    description: "Toggle guardian auto-review for risky tool calls",
    handler: async (_args, ctx) => {
      setEnabled(!enabled, ctx);
    },
  });

  pi.registerCommand("auto-review", {
    description: "Approve one retry of a recent guardian auto-review denial",
    handler: async (_args, ctx) => {
      if (recentDenials.length === 0) {
        ctx.ui.notify("No recent auto-review denials in this thread.", "info");
        return;
      }

      const labels = recentDenials.map((denial, index) => {
        const shortSummary = denial.summary.length > 80 ? `${denial.summary.slice(0, 77)}...` : denial.summary;
        const shortRationale = denial.rationale.length > 100 ? `${denial.rationale.slice(0, 97)}...` : denial.rationale;
        return `${index + 1}. ${shortSummary} — ${shortRationale}`;
      });
      const choice = await ctx.ui.select("Auto-review denials — select an action to approve once", labels);
      if (!choice) return;

      const index = labels.indexOf(choice);
      const denial = recentDenials[index];
      if (!denial) return;

      approvedOnce.set(denial.fingerprint, {
        fingerprint: denial.fingerprint,
        actionJson: JSON.stringify({ action: { toolName: denial.toolName, input: denial.input }, outcome: "allowed" }, null, 2),
        timestamp: Date.now(),
      });
      recentDenials = recentDenials.filter((item) => item.id !== denial.id);
      ctx.ui.notify(
        "Approval recorded for one retry of the selected action. The retry still goes through guardian auto-review.",
        "info",
      );
      updateStatus(ctx);
      persist();
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!enabled || reviewing) return;
    if (!isRiskyToolCall(event.toolName, event.input)) return;

    reviewing = true;
    updateStatus(ctx);
    try {
      const decision = await reviewAction(ctx, event.toolName, event.input);
      reviewing = false;

      if (decision.outcome === "approve" && decision.risk_level === "low") {
        recordNonDenial();
        updateStatus(ctx);
        persist();
        return;
      }

      const denial = recordDenial(ctx, event.toolName, event.input, decision);
      updateStatus(ctx);
      persist();
      return {
        block: true,
        reason: `Guardian auto-review denied this ${event.toolName} call (${decision.risk_level}, ${decision.user_authorization} authorization): ${decision.rationale}\nDenial id: ${denial.id}. Use /auto-review to approve one retry of a recent denial.`,
      };
    } catch (error) {
      reviewing = false;
      const decision: GuardianDecision = {
        outcome: "deny",
        risk_level: "high",
        user_authorization: "unclear",
        rationale: error instanceof Error ? error.message : String(error),
      };
      const denial = recordDenial(ctx, event.toolName, event.input, decision);
      updateStatus(ctx);
      persist();
      return {
        block: true,
        reason: `Guardian auto-review failed closed for ${event.toolName}: ${decision.rationale}\nDenial id: ${denial.id}. Use /auto-review to approve one retry of a recent denial.`,
      };
    }
  });

  pi.on("agent_start", async () => {
    consecutiveDenialsThisTurn = 0;
    totalDenialsThisTurn = 0;
  });

  pi.on("session_start", async (_event, ctx) => {
    const stateEntry = ctx.sessionManager
      .getEntries()
      .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === "guardian-auto-review")
      .pop() as { data?: GuardianAutoReviewState } | undefined;

    if (stateEntry?.data) {
      enabled = stateEntry.data.enabled ?? false;
      recentDenials = stateEntry.data.recentDenials ?? [];
      approvedOnce = new Map((stateEntry.data.approvedOnce ?? []).map((item) => [item.fingerprint, item]));
    }
    if (pi.getFlag("guardian-auto-review") === true) enabled = true;
    updateStatus(ctx);
  });
}
