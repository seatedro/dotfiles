import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DIRENV_CONTEXT =
	"The shell environment is managed by direnv; run commands directly without wrapping them in `nix develop` or `direnv exec`.";

export default function direnvContext(pi: ExtensionAPI): void {
	pi.on("before_agent_start", async (event) => ({
		systemPrompt: `${event.systemPrompt}\n\n${DIRENV_CONTEXT}`,
	}));
}
