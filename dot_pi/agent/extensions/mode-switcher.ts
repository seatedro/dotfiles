import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Effect, pipe } from "effect";

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

const registry = (): Registry => {
  const global = globalThis as typeof globalThis & { __piModeRegistry?: Registry };
  global.__piModeRegistry ??= { modes: new Map() };
  return global.__piModeRegistry;
};

const registerMode = (mode: PiMode): void => {
  registry().modes.set(mode.name, mode);
};

const runModeHook = (ctx: ExtensionContext, hook: (ctx: ExtensionContext) => void | Promise<void>) =>
  Effect.tryPromise({
    try: () => Promise.resolve(hook(ctx)),
    catch: (cause) => cause,
  });

const notifyNormalMode = (ctx: ExtensionContext) =>
  Effect.sync(() => {
    ctx.ui.notify("Mode: normal", "info");
    ctx.ui.setStatus("mode", undefined);
  });

const switchToModeEffect = (target: "normal" | string, ctx: ExtensionContext) =>
  Effect.gen(function* () {
    const modes = [...registry().modes.values()];

    yield* Effect.forEach(
      modes.filter((mode) => mode.name !== target && mode.isActive()),
      (mode) => runModeHook(ctx, mode.exit),
      { discard: true },
    );

    if (target === "normal") return yield* notifyNormalMode(ctx);

    const mode = registry().modes.get(target);
    if (!mode) {
      return yield* Effect.sync(() => ctx.ui.notify(`Mode not available: ${target}`, "warning"));
    }

    if (!mode.isActive()) yield* runModeHook(ctx, mode.enter);
    yield* Effect.sync(() =>
      ctx.ui.setStatus(
        "mode",
        `${ctx.ui.theme.fg("warning", "▸▸")} ${ctx.ui.theme.fg("warning", `${mode.label} mode on`)} ${ctx.ui.theme.fg("dim", "(shift+tab to cycle)")}`,
      ),
    );
  });

const switchToMode = (target: "normal" | string, ctx: ExtensionContext): Promise<void> =>
  Effect.runPromise(switchToModeEffect(target, ctx));

const cycleModeEffect = (ctx: ExtensionContext) =>
  pipe(
    Effect.sync(() => {
      const modes = [...registry().modes.values()];
      const order = ["normal", ...modes.map((mode) => mode.name)];
      const active = modes.find((mode) => mode.isActive())?.name ?? "normal";
      return order[(order.indexOf(active) + 1) % order.length] ?? "normal";
    }),
    Effect.flatMap((next) => switchToModeEffect(next, ctx)),
  );

const cycleMode = (ctx: ExtensionContext): Promise<void> => Effect.runPromise(cycleModeEffect(ctx));

export default function modeSwitcher(pi: ExtensionAPI) {
  const global = globalThis as typeof globalThis & { __piRegisterMode?: (mode: PiMode) => void };
  global.__piRegisterMode = registerMode;

  pi.registerCommand("mode", {
    description: "Switch mode: /mode [normal|plan|auto-review]",
    handler: (args, ctx) => {
      const requested = args.trim();
      return requested ? switchToMode(requested, ctx) : cycleMode(ctx);
    },
  });

  pi.registerShortcut("shift+tab", {
    description: "Cycle mode",
    handler: cycleMode,
  });
}
