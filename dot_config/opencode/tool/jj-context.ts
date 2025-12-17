/**
 * git-context - get current vcs context using jujutsu (jj)
 */

import { tool } from "@opencode-ai/plugin";
import { Effect, pipe } from "effect";
import { $ } from "bun";

class JJContextError {
  readonly _tag = "JJContextError";
  constructor(readonly message: string) {}
}

const runJJ = (args: string[]) =>
  Effect.tryPromise({
    try: async () => {
      const result = await $`jj ${args}`.text();
      return result.trim();
    },
    catch: (e) => new JJContextError(`Failed to run jj ${args.join(" ")}: ${e}`),
  });

const getWorkingCopyInfo = () =>
  runJJ([
    "log",
    "-r",
    "@",
    "--no-graph",
    "-T",
    'change_id.short() ++ " " ++ description.first_line()',
  ]);

const getStatus = () =>
  runJJ(["status"]).pipe(Effect.catchAll(() => Effect.succeed("(clean)")));

const getLog = () =>
  runJJ([
    "log",
    "-r",
    "ancestors(@, 5)",
    "--no-graph",
    "-T",
    'change_id.short() ++ " " ++ if(description, description.first_line(), "(no description)") ++ "\n"',
  ]).pipe(Effect.catchAll(() => Effect.succeed("No commits")));

const getBranches = () =>
  runJJ(["log", "-r", "@", "--no-graph", "-T", 'local_bookmarks.join(", ")']).pipe(
    Effect.map((b) => b || "(no bookmark)"),
    Effect.catchAll(() => Effect.succeed("(no bookmark)")),
  );

const getDiff = () =>
  runJJ(["diff", "--stat"]).pipe(
    Effect.catchAll(() => Effect.succeed("(no changes)")),
  );

const getConflicts = () =>
  runJJ([
    "log",
    "-r",
    "conflicts()",
    "--no-graph",
    "-T",
    'change_id.short() ++ " " ++ description.first_line() ++ "\n"',
  ]).pipe(
    Effect.map((c) => c.trim() || null),
    Effect.catchAll(() => Effect.succeed(null)),
  );

export default tool({
  description:
    "Get current git context: branch, status, recent commits, diff stats",
  args: {},
  async execute() {
    const program = pipe(
      Effect.all({
        workingCopy: getWorkingCopyInfo(),
        branches: getBranches(),
        status: getStatus(),
        log: getLog(),
        diff: getDiff(),
        conflicts: getConflicts(),
      }),

      Effect.map(({ workingCopy, branches, status, log, diff, conflicts }) => {
        let output = `Working copy: ${workingCopy}
Bookmarks: ${branches}

Status:
${status}

Recent changes:
${log}
Current diff:
${diff.trim() || "(no changes)"}`;

        if (conflicts) {
          output += `\n\nConflicts:
${conflicts}`;
        }

        return output;
      }),
    );

    const result = await Effect.runPromise(Effect.either(program));
    return result._tag === "Left"
      ? `JJ error: ${result.left.message}`
      : result.right;
  },
});
