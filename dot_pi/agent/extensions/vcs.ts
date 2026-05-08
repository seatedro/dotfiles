import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "vcs";
const DETECT_TIMEOUT_MS = 2_000;

type VcsKind = "jj" | "git" | "none";

interface VcsState {
  cwd?: string;
  kind: VcsKind;
  root?: string;
}

function buildPrompt(state: VcsState): string | undefined {
  if (state.kind === "none") return undefined;

  const detected =
    state.kind === "jj"
      ? `Detected VCS: jj${state.root ? ` at ${state.root}` : ""}. Use jj for version-control operations in this repository.`
      : state.kind === "git"
        ? `Detected VCS: git${state.root ? ` at ${state.root}` : ""}. Use git for version-control operations in this repository.`
        : "No jj or git repository was detected from the current working directory.";

  const defaults =
    state.kind === "jj"
      ? "Prefer jj commands such as `jj status`, `jj diff`, `jj log`, `jj new`, `jj squash`, and `jj git push`. Do not use git directly unless needed for an operation jj cannot perform."
      : state.kind === "git"
        ? "Prefer git commands such as `git status`, `git diff`, `git log`, `git add`, `git commit`, and `git push`. Do not use jj commands in this repository."
        : "If version-control work is requested, first determine whether the working directory has moved into a jj or git repository.";

  return `Version-control context:\n- ${detected}\n- ${defaults}`;
}

function updateStatus(ctx: ExtensionContext, state: VcsState): void {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus(STATUS_KEY, state.kind === "none" ? undefined : ctx.ui.theme.fg("muted", state.kind));
}

export default function vcsExtension(pi: ExtensionAPI): void {
  let state: VcsState = { kind: "none" };

  async function detect(ctx: ExtensionContext, force = false): Promise<VcsState> {
    if (!force && state.cwd === ctx.cwd) return state;

    const jj = await pi.exec("jj", ["root"], { cwd: ctx.cwd, signal: ctx.signal, timeout: DETECT_TIMEOUT_MS });
    if (jj.code === 0) {
      const root = jj.stdout.trim();
      state = { cwd: ctx.cwd, kind: "jj", root: root || undefined };
      updateStatus(ctx, state);
      return state;
    }

    const git = await pi.exec("git", ["rev-parse", "--show-toplevel"], {
      cwd: ctx.cwd,
      signal: ctx.signal,
      timeout: DETECT_TIMEOUT_MS,
    });
    if (git.code === 0) {
      const root = git.stdout.trim();
      state = { cwd: ctx.cwd, kind: "git", root: root || undefined };
      updateStatus(ctx, state);
      return state;
    }

    state = { cwd: ctx.cwd, kind: "none" };
    updateStatus(ctx, state);
    return state;
  }

  pi.registerCommand("vcs", {
    description: "Show or refresh detected VCS context",
    handler: async (args, ctx) => {
      const refreshed = await detect(ctx, args.trim() === "refresh");
      const root = refreshed.root ? ` at ${refreshed.root}` : "";
      ctx.ui.notify(`VCS: ${refreshed.kind}${root}`, "info");
    },
  });

  pi.on("session_start", (_event, ctx) => {
    void detect(ctx).catch(() => undefined);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const detected = await detect(ctx);
    const prompt = buildPrompt(detected);
    if (!prompt) return undefined;
    return { systemPrompt: `${event.systemPrompt}\n\n${prompt}` };
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}
