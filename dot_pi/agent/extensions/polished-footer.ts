import type { ExtensionAPI, ReadonlyFooterDataProvider } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function visibleWidth(text: string): number {
  return stripAnsi(text).length;
}

function truncatePlain(text: string, width: number, ellipsis = "…"): string {
  const plain = stripAnsi(text);
  if (plain.length <= width) return text;
  if (width <= ellipsis.length) return ellipsis.slice(0, width);
  return plain.slice(0, width - ellipsis.length) + ellipsis;
}

function sanitize(text: string): string {
  return stripAnsi(text).replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

function fitLine(left: string, right: string, width: number): string {
  const leftWidth = visibleWidth(left);
  const rightWidth = visibleWidth(right);
  if (leftWidth + 2 + rightWidth <= width) return left + " ".repeat(width - leftWidth - rightWidth) + right;

  const rightBudget = Math.max(0, width - leftWidth - 2);
  if (rightBudget > 8) {
    const fittedRight = truncatePlain(right, rightBudget, "");
    return left + " ".repeat(Math.max(2, width - leftWidth - visibleWidth(fittedRight))) + fittedRight;
  }
  return truncatePlain(left, width);
}

function dot(theme: Theme): string {
  return theme.fg("dim", " · ");
}

function formatMode(theme: Theme, statuses: Map<string, string>): string | undefined {
  const rawMode = statuses.get("mode");
  if (rawMode) {
    const clean = sanitize(rawMode);
    const match = clean.match(/(?:▸▸\s*)?(.+?)\s+mode\s+on/i);
    const name = match?.[1]?.trim() || clean.replace(/\s*\(.*\)$/, "").trim();
    return `${theme.fg("warning", "✦")} ${theme.fg("warning", `${name} on`)} ${theme.fg("dim", "⇧tab")}`;
  }

  const plan = statuses.get("plan-mode");
  if (plan) return `${theme.fg("warning", "✦")} ${theme.fg("warning", "plan on")} ${theme.fg("dim", "⇧tab")}`;

  const guardian = statuses.get("guardian-auto-review");
  if (guardian) {
    const clean = sanitize(guardian);
    const suffix = clean.match(/:(\d+)/)?.[1];
    return `${theme.fg("warning", "✦")} ${theme.fg("warning", `auto-review on${suffix ? `:${suffix}` : ""}`)} ${theme.fg("dim", "⇧tab")}`;
  }

  return undefined;
}

export default function polishedFooter(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) =>
    Effect.runSync(
      Effect.sync(() => {
        if (!ctx.hasUI) return;

        ctx.ui.setFooter((_tui: TUI, theme: Theme, footerData: ReadonlyFooterDataProvider): Component => ({
      invalidate() {},
      render(width: number): string[] {
        const entries = ctx.sessionManager.getEntries();
        let totalInput = 0;
        let totalOutput = 0;
        let totalCacheRead = 0;
        let totalCacheWrite = 0;
        let totalCost = 0;

        for (const entry of entries) {
          if (entry.type === "message" && entry.message.role === "assistant") {
            totalInput += entry.message.usage.input;
            totalOutput += entry.message.usage.output;
            totalCacheRead += entry.message.usage.cacheRead;
            totalCacheWrite += entry.message.usage.cacheWrite;
            totalCost += entry.message.usage.cost.total;
          }
        }

        const home = process.env.HOME || "";
        const cwd = home && ctx.cwd.startsWith(home) ? `~${ctx.cwd.slice(home.length)}` : ctx.cwd;
        const branch = footerData.getGitBranch();
        const location = branch ? `${cwd} ${theme.fg("dim", `(${branch})`)}` : cwd;

        const context = ctx.getContextUsage?.();
        const contextWindow = context?.contextWindow ?? ctx.model?.contextWindow;
        const contextPart = contextWindow
          ? `${context?.percent == null ? "?" : context.percent.toFixed(1)}%/${formatTokens(contextWindow)} (auto)`
          : undefined;
        const usingSubscription = ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false;

        // Preserve Pi's original footer stats format: ↑input ↓output Rcache Wcache $cost (sub) context/window (auto)
        const statParts = [
          totalInput ? `↑${formatTokens(totalInput)}` : undefined,
          totalOutput ? `↓${formatTokens(totalOutput)}` : undefined,
          totalCacheRead ? `R${formatTokens(totalCacheRead)}` : undefined,
          totalCacheWrite ? `W${formatTokens(totalCacheWrite)}` : undefined,
          totalCost || usingSubscription ? `$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}` : undefined,
          contextPart,
        ].filter(Boolean) as string[];

        const statuses = new Map<string, string>(footerData.getExtensionStatuses());
        const mode = formatMode(theme, statuses);
        const extraStatuses = [...statuses.entries()]
          .filter(([key]) => !["mode", "plan-mode", "guardian-auto-review"].includes(key))
          .map(([, value]) => sanitize(value))
          .filter(Boolean);

        const leftSegments = [
          theme.fg("dim", statParts.join(" ")),
          mode,
          ...extraStatuses.map((status) => theme.fg("muted", status)),
        ].filter(Boolean) as string[];

        const currentThinkingLevel =
          (ctx as typeof ctx & { getThinkingLevel?: () => string }).getThinkingLevel?.() ??
          (pi as typeof pi & { getThinkingLevel?: () => string }).getThinkingLevel?.();
        const thinkingLevel = ctx.model?.reasoning && currentThinkingLevel ? ` (${currentThinkingLevel})` : "";
        const model = ctx.model
          ? `${ctx.model.provider}/${ctx.model.id}${thinkingLevel}`
          : "no model";
        const right = theme.fg("dim", model);
        const left = leftSegments.join(dot(theme)) || theme.fg("dim", "ready");

        return [
          theme.fg("dim", truncatePlain(location, width)),
          fitLine(left, right, width),
        ];
      },
        }));
      }),
    ),
  );
}
