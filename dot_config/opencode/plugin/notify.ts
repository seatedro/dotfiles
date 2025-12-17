/**
 * notify plugin - plays sound on task completion
 *
 * uses macos afplay to play system sounds when:
 * - swarm completes successfully
 * - swarm fails/aborts
 * - session becomes idle (response complete)
 */

import type { Plugin } from "@opencode-ai/plugin";

const SOUNDS = {
  success: "/System/Library/Sounds/Glass.aiff",
  error: "/System/Library/Sounds/Basso.aiff",
  complete: "/System/Library/Sounds/Ping.aiff",
};

async function playSound(sound: keyof typeof SOUNDS): Promise<void> {
  try {
    Bun.spawn(["afplay", SOUNDS[sound]], {
      stdout: "ignore",
      stderr: "ignore",
    });
  } catch {}
}

export const NotifyPlugin: Plugin = async () => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await playSound("complete");
      }
    },

    "tool.execute.after": async (toolInput, output) => {
      if (toolInput.tool === "swarm_finalize") {
        const result = JSON.parse(output.output ?? "{}");
        if (result.success) {
          await playSound("success");
        }
      }

      if (toolInput.tool === "swarm_abort") {
        await playSound("error");
      }
    },
  };
};

export default NotifyPlugin;
