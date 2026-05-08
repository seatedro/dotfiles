import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type PiMode = {
  name: string;
  label: string;
  isActive(): boolean;
  enter(ctx: ExtensionContext): void | Promise<void>;
  exit(ctx: ExtensionContext): void | Promise<void>;
};

type Registry = {
  modes: Map<string, PiMode>;
};

function registry(): Registry {
  const global = globalThis as typeof globalThis & { __piModeRegistry?: Registry };
  global.__piModeRegistry ??= { modes: new Map() };
  return global.__piModeRegistry;
}

function registerMode(mode: PiMode): void {
  registry().modes.set(mode.name, mode);
}

async function switchToMode(target: "normal" | string, ctx: ExtensionContext): Promise<void> {
  const modes = [...registry().modes.values()];

  for (const mode of modes) {
    if (mode.name !== target && mode.isActive()) {
      await mode.exit(ctx);
    }
  }

  if (target === "normal") {
    ctx.ui.notify("Mode: normal", "info");
    ctx.ui.setStatus("mode", undefined);
    return;
  }

  const mode = registry().modes.get(target);
  if (!mode) {
    ctx.ui.notify(`Mode not available: ${target}`, "warning");
    return;
  }

  if (!mode.isActive()) await mode.enter(ctx);
  ctx.ui.setStatus(
    "mode",
    `${ctx.ui.theme.fg("warning", "▸▸")} ${ctx.ui.theme.fg("warning", `${mode.label} mode on`)} ${ctx.ui.theme.fg("dim", "(shift+tab to cycle)")}`,
  );
}

async function cycleMode(ctx: ExtensionContext): Promise<void> {
  const modes = [...registry().modes.values()];
  const order = ["normal", ...modes.map((mode) => mode.name)];
  const active = modes.find((mode) => mode.isActive())?.name ?? "normal";
  const next = order[(order.indexOf(active) + 1) % order.length] ?? "normal";
  await switchToMode(next, ctx);
}

export default function modeSwitcher(pi: ExtensionAPI) {
  const global = globalThis as typeof globalThis & { __piRegisterMode?: (mode: PiMode) => void };
  global.__piRegisterMode = registerMode;

  pi.registerCommand("mode", {
    description: "Switch mode: /mode [normal|plan|auto-review]",
    handler: async (args, ctx) => {
      const requested = args.trim();
      if (!requested) {
        await cycleMode(ctx);
        return;
      }
      await switchToMode(requested, ctx);
    },
  });

  pi.registerShortcut("shift+tab", {
    description: "Cycle mode",
    handler: cycleMode,
  });
}
