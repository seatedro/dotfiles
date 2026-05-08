---
name: pi-create-extension
description: Use when creating, reviewing, or refactoring Pi coding agent extensions. Covers the preferred local style for extension structure, commands, tools, events, prompt injection, persistence, UI status, Effect usage, and safe reload behavior.
---

# Pi Create Extension

Use this skill for Pi extension work.

## Blessed Defaults

- Put extensions where Pi auto-discovers them so `/reload` works:
  - global: `~/.pi/agent/extensions/name.ts` or `~/.pi/agent/extensions/name/index.ts`
  - project: `.pi/extensions/name.ts` or `.pi/extensions/name/index.ts`
- Use a single `.ts` file for small extensions; use `name/index.ts` when helpers, state types, or tests would make one file noisy.
- Export one explicit factory:
  ```ts
  import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

  export default function myExtension(pi: ExtensionAPI): void {
    // register commands, tools, and event handlers here
  }
  ```
- Prefer typed helpers and small pure functions over large inline handlers.
- Use constants for status keys, custom entry types, timeouts, limits, and model names.
- Use `Effect` for non-trivial async/fallible workflows; plain async/await is fine for tiny extensions.
- Avoid `any`; narrow with structural types or Pi's documented type guards.
- Keep outputs and injected prompts bounded. Truncate large transcripts, command output, file content, and JSON.

## Pi Extension Patterns

- Dynamic instructions: use `before_agent_start` and append short factual context to `event.systemPrompt`.
- User actions: use `pi.registerCommand` for toggles, refresh commands, diagnostics, and manual overrides.
- Model-callable behavior: use `pi.registerTool` with `typebox` schemas, clear descriptions, and useful `promptSnippet` / `promptGuidelines`.
- Tool policy or argument rewriting: use `tool_call`; mutate only when intentional, and return `{ block: true, reason }` for denials.
- Tool result shaping: use `tool_result`; keep returned content concise.
- Session state: keep runtime state in closure variables, restore it in `session_start`, and persist with `pi.appendEntry(customType, data)` when it should survive reload/resume.
- UI state: use one stable status key; clear stale statuses/widgets when disabled or in `session_shutdown`.
- TUI-only features: check `ctx.hasUI` before custom widgets, dialogs, footers, or overlays.
- Cancellation: pass `ctx.signal` to nested async work when available.
- Shell commands: prefer `pi.exec(command, args, { cwd: ctx.cwd, signal: ctx.signal, timeout })` over ad-hoc process spawning.
- Reload/session replacement: after `await ctx.reload()` or a session switch, return immediately and don't use stale captured session objects.

## Local Mode Convention

If an extension is a mode, register it with the shared mode registry exposed on `globalThis.__piModeRegistry`:

- mode shape: `{ name, label, isActive, enter(ctx), exit(ctx) }`
- `enter`/`exit` should update state, status, and persistence
- modes are cycled by the existing mode switcher with Shift+Tab

Only add mode integration when the extension is genuinely a user-facing mode.

## Safety Rules

- Never perform destructive work from extension startup.
- Do not spam notifications for background detection; use silent status/prompt context unless the user asked for diagnostics.
- Respect `ctx.cwd`; do not assume machine-specific absolute paths unless the user explicitly requested them.
- Fail closed for safety/review extensions.
- For model-in-the-loop review, use timeouts, bounded prompts, fallback behavior, and strict parsing.

## Verification

After editing an extension:

1. Run available TypeScript/project checks when practical.
2. Smoke test with `pi --no-session --extension <path> -p "..."` when safe.
3. For auto-discovered extensions, tell the user to run `/reload` in existing Pi sessions.
4. Report changed paths, added commands/tools, and any reload/test notes.
