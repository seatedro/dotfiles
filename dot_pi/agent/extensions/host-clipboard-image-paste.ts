import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, pipe } from "effect";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PORT = process.env.PI_HOST_CLIPBOARD_PORT || "17653";
const TIMEOUT_MS = 3000;
const AUTO_START = process.env.PI_HOST_CLIPBOARD_AUTOSTART !== "0";
const LEGACY_DEFAULT_HOST = "macbook";

type BridgePath = "image" | "health";
type HostTarget = {
  label: string;
  clientIp?: string;
  urlHosts: string[];
  sshHosts: string[];
};

type TailscaleNode = {
  HostName?: string;
  DNSName?: string;
  TailscaleIPs?: string[];
};

type ExecResult = { stdout: string; stderr: string; code: number; killed: boolean };
type UiContext = {
  hasUI: boolean;
  ui: {
    notify(message: string, level?: "info" | "warning" | "error" | string): void;
    pasteToEditor(text: string): void;
    onTerminalInput(handler: (data: string) => { consume: true } | { data: string } | undefined): void;
  };
};
type PiContext = UiContext;

const unique = (values: Array<string | undefined>): string[] => [
  ...new Set(values.filter((value): value is string => Boolean(value))),
];

const stripTrailingDot = (name: string | undefined): string | undefined => name?.replace(/\.$/, "");
const firstDnsLabel = (name: string | undefined): string | undefined => stripTrailingDot(name)?.split(".")[0];

const extensionForMime = (mime: string | undefined): string => {
  switch ((mime ?? "").split(";")[0]?.toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/png":
    default:
      return "png";
  }
};

const effectError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

const exec = (pi: ExtensionAPI, command: string, args: string[], timeout = 5_000): Effect.Effect<ExecResult, Error> =>
  Effect.tryPromise({
    try: () => pi.exec(command, args, { timeout }) as Promise<ExecResult>,
    catch: effectError,
  });

const shellSingleQuote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

const remoteShellCommand = (command: string): string => `sh -lc ${shellSingleQuote(command)}`;

const shell = (pi: ExtensionAPI, command: string, timeout = 5_000) =>
  exec(pi, "sh", ["-lc", command], timeout);

const parseRemoteFromWhoLine = (line: string): string | undefined => line.match(/\(([^()]+)\)\s*$/)?.[1]?.split(/\s+/)[0];

const explicitHost = (): string | undefined => process.env.PI_HOST_CLIPBOARD_HOST;

const sshClientIp = (): string | undefined =>
  process.env.SSH_CONNECTION?.split(/\s+/)[0] || process.env.SSH_CLIENT?.split(/\s+/)[0];

const ttyRemoteIp = (pi: ExtensionAPI) =>
  pipe(
    shell(
      pi,
      `tty_name=$(tty 2>/dev/null | sed 's#^/dev/##'); [ -n "$tty_name" ] && who -u | awk -v t="$tty_name" '$2 == t { print }'`,
    ),
    Effect.map((result) => (result.code === 0 ? parseRemoteFromWhoLine(result.stdout.trim()) : undefined)),
    Effect.catchAll(() => Effect.succeed(undefined)),
  );

const activeMoshRemoteIp = (pi: ExtensionAPI) =>
  pipe(
    shell(pi, "who -u | grep -oE '\\([0-9a-fA-F:.]+ via mosh [^)]*\\)' | sed -E 's/^\\(([^ ]+).*/\\1/' | tail -n1"),
    Effect.map((result) => result.stdout.trim().split(/\s+/).filter(Boolean).at(-1)),
    Effect.catchAll(() => Effect.succeed(undefined)),
  );

const discoverClientIp = (pi: ExtensionAPI) =>
  pipe(
    ttyRemoteIp(pi),
    Effect.flatMap((ttyIp) => (ttyIp ? Effect.succeed(ttyIp) : activeMoshRemoteIp(pi))),
    Effect.map((ip) => explicitHost() || ip || sshClientIp()),
  );

const tailscaleNodes = (pi: ExtensionAPI) =>
  pipe(
    exec(pi, "tailscale", ["status", "--json"], 5_000),
    Effect.flatMap((result) =>
      result.code === 0
        ? Effect.try({
            try: () => JSON.parse(result.stdout) as { Self?: TailscaleNode; Peer?: Record<string, TailscaleNode> },
            catch: effectError,
          })
        : Effect.fail(new Error(result.stderr.trim() || `tailscale status exited ${result.code}`)),
    ),
    Effect.map((status) => [status.Self, ...Object.values(status.Peer ?? {})].filter(Boolean) as TailscaleNode[]),
  );

const targetFromNode = (clientIp: string, node: TailscaleNode): HostTarget => {
  const dnsName = stripTrailingDot(node.DNSName);
  const magicDnsShortName = firstDnsLabel(node.DNSName);
  const hostName = node.HostName;
  const hosts = unique([magicDnsShortName, dnsName, hostName, clientIp]);
  return {
    label: magicDnsShortName || dnsName || hostName || clientIp,
    clientIp,
    urlHosts: hosts,
    sshHosts: hosts,
  };
};

const identifyHost = (pi: ExtensionAPI): Effect.Effect<HostTarget, Error> => {
  const explicitUrl = process.env.PI_HOST_CLIPBOARD_URL;
  if (explicitUrl) {
    return Effect.try({
      try: () => {
        const host = new URL(explicitUrl).hostname;
        return { label: host, urlHosts: [host], sshHosts: [host] };
      },
      catch: effectError,
    });
  }

  return pipe(
    discoverClientIp(pi),
    Effect.flatMap((clientIp) => {
      if (!clientIp) {
        return Effect.succeed({
          label: LEGACY_DEFAULT_HOST,
          urlHosts: [LEGACY_DEFAULT_HOST, "127.0.0.1"],
          sshHosts: [LEGACY_DEFAULT_HOST],
        });
      }
      return pipe(
        tailscaleNodes(pi),
        Effect.map((nodes) => nodes.find((node) => node.TailscaleIPs?.includes(clientIp))),
        Effect.map((node) => (node ? targetFromNode(clientIp, node) : { label: clientIp, clientIp, urlHosts: [clientIp], sshHosts: [clientIp] })),
        Effect.catchAll(() => Effect.succeed({ label: clientIp, clientIp, urlHosts: [clientIp], sshHosts: [clientIp] })),
      );
    }),
  );
};

const urlFor = (host: string, path: BridgePath): string => {
  const formattedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${formattedHost}:${PORT}/${path}`;
};

const bridgeUrls = (pi: ExtensionAPI, path: BridgePath) => {
  if (process.env.PI_HOST_CLIPBOARD_URL) {
    return Effect.succeed([process.env.PI_HOST_CLIPBOARD_URL.replace(/\/(image|health)$/, `/${path}`)]);
  }
  return pipe(
    identifyHost(pi),
    Effect.map((host) => host.urlHosts.map((urlHost) => urlFor(urlHost, path))),
  );
};

const fetchUrl = (url: string): Effect.Effect<{ mime: string; bytes: Buffer } | undefined, Error> =>
  Effect.tryPromise({
    try: async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (response.status === 204 || response.status === 404) return undefined;
        if (!response.ok) throw new Error(`host clipboard bridge returned HTTP ${response.status}`);
        const json = (await response.json()) as { mime?: string; data?: string };
        if (!json.data) return undefined;
        return { mime: json.mime || "image/png", bytes: Buffer.from(json.data, "base64") };
      } finally {
        clearTimeout(timeout);
      }
    },
    catch: effectError,
  });

const fetchFirstImage = (urls: string[]): Effect.Effect<{ mime: string; bytes: Buffer } | undefined, Error> =>
  urls.length === 0
    ? Effect.succeed(undefined)
    : pipe(
        fetchUrl(urls[0]),
        Effect.flatMap((image) => (image ? Effect.succeed(image) : fetchFirstImage(urls.slice(1)))),
        Effect.catchAll((error) => (urls.length === 1 ? Effect.fail(error) : fetchFirstImage(urls.slice(1)))),
      );

const isBridgeHealthy = (pi: ExtensionAPI) =>
  pipe(
    bridgeUrls(pi, "health"),
    Effect.flatMap((urls) =>
      Effect.forEach(
        urls,
        (url) =>
          pipe(
            Effect.tryPromise({
              try: async () => {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 1000);
                try {
                  return (await fetch(url, { signal: controller.signal })).ok;
                } finally {
                  clearTimeout(timeout);
                }
              },
              catch: () => false,
            }),
            Effect.catchAll(() => Effect.succeed(false)),
          ),
        { concurrency: "unbounded" },
      ),
    ),
    Effect.map((results) => results.some(Boolean)),
  );

const fetchHostClipboardImage = (pi: ExtensionAPI) =>
  pipe(
    bridgeUrls(pi, "image"),
    Effect.flatMap(fetchFirstImage),
  );

const isCtrlV = (data: string): boolean => data === "\x16" || data === "\x1b[118;5u" || data === "\x1b[86;5u";

const remoteInstallAndStartCommand = (): string => {
  const helperPath = join(homedir(), ".pi/agent/helpers/pi-host-clipboard-server.mjs");
  const helperBase64 = readFileSync(helperPath).toString("base64");
  return [
    "mkdir -p ~/bin",
    `printf %s ${shellSingleQuote(helperBase64)} | base64 -d > ~/bin/pi-host-clipboard-server.mjs`,
    "chmod +x ~/bin/pi-host-clipboard-server.mjs",
    "pgrep -f '[p]i-host-clipboard-server.mjs' >/dev/null || (",
    "bind=$(tailscale ip -4 2>/dev/null | head -n1);",
    "bind=${bind:-0.0.0.0};",
    "PI_HOST_CLIPBOARD_BIND=$bind PI_HOST_CLIPBOARD_PORT=${PI_HOST_CLIPBOARD_PORT:-17653} nohup node ~/bin/pi-host-clipboard-server.mjs > /tmp/pi-host-clipboard-server.log 2>&1 < /dev/null &",
    ")",
  ].join("\n");
};

const sshTargets = (host: HostTarget): string[] => {
  if (process.env.PI_HOST_CLIPBOARD_SSH) return [process.env.PI_HOST_CLIPBOARD_SSH];
  const users = unique([process.env.PI_HOST_CLIPBOARD_SSH_USER, process.env.USER, "ro"]);
  return unique(host.sshHosts.flatMap((sshHost) => users.map((user) => `${user}@${sshHost}`)));
};

const runRemoteStart = (pi: ExtensionAPI, target: string, remoteCommand: string) =>
  pipe(
    exec(pi, "tailscale", ["ssh", target, remoteShellCommand(remoteCommand)], 15_000),
    Effect.flatMap((tailscaleResult) => {
      if (tailscaleResult.code === 0) return Effect.succeed(tailscaleResult);
      return pipe(
        exec(
          pi,
          "ssh",
          [
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=5",
            "-o",
            "StrictHostKeyChecking=no",
            "-o",
            "UserKnownHostsFile=/dev/null",
            target,
            remoteShellCommand(remoteCommand),
          ],
          15_000,
        ),
        Effect.map((sshResult) => {
          if (sshResult.code === 0) return sshResult;
          return {
            ...sshResult,
            stderr: `tailscale ssh: ${tailscaleResult.stderr.trim() || tailscaleResult.stdout.trim() || `exited ${tailscaleResult.code}`}\nssh: ${sshResult.stderr.trim() || sshResult.stdout.trim() || `exited ${sshResult.code}`}`,
          };
        }),
      );
    }),
  );

const startBridge = (pi: ExtensionAPI, host: HostTarget) => {
  const remoteCommand = remoteInstallAndStartCommand();
  const tryTarget = (targets: string[], errors: string[]): Effect.Effect<string, Error> => {
    const [target, ...rest] = targets;
    if (!target) {
      return Effect.fail(
        new Error(
          `could not start bridge on ${host.label}; tried ${errors.join("; ")}. ` +
            "The connecting host must allow passwordless SSH/Tailscale SSH from this Pi server, " +
            "or start ~/bin/pi-host-clipboard-server.mjs on that host manually.",
        ),
      );
    }
    return pipe(
      runRemoteStart(pi, target, remoteCommand),
      Effect.flatMap((result) => {
        if (result.code === 0) return Effect.succeed(host.label);
        const message = result.stderr.trim() || result.stdout.trim() || `remote start exited ${result.code}`;
        return tryTarget(rest, [...errors, `${target}: ${message}`]);
      }),
    );
  };
  return tryTarget(sshTargets(host), []);
};

const ensureHostBridge = (pi: ExtensionAPI) =>
  pipe(
    identifyHost(pi),
    Effect.flatMap((host) =>
      !AUTO_START
        ? Effect.succeed(host.label)
        : pipe(
            isBridgeHealthy(pi),
            Effect.flatMap((healthy) => (healthy ? Effect.succeed(host.label) : startBridge(pi, host))),
          ),
    ),
  );

const pasteFromHost = (pi: ExtensionAPI, ctx: PiContext) =>
  pipe(
    ensureHostBridge(pi),
    Effect.flatMap((hostLabel) =>
      pipe(
        fetchHostClipboardImage(pi),
        Effect.flatMap((image) => {
          if (!image) {
            return Effect.sync(() => ctx.ui.notify(`No image from ${hostLabel} clipboard bridge.`, "warning"));
          }
          return Effect.sync(() => {
            const ext = extensionForMime(image.mime);
            const filePath = join(tmpdir(), `pi-host-clipboard-${randomUUID()}.${ext}`);
            writeFileSync(filePath, image.bytes);
            ctx.ui.pasteToEditor(`@${filePath} `);
            ctx.ui.notify(`Pasted image from ${hostLabel} clipboard bridge.`, "info");
          });
        }),
      ),
    ),
    Effect.catchAll((error) =>
      Effect.sync(() => ctx.ui.notify(`Host clipboard image paste failed: ${error.message}`, "error")),
    ),
  );

export default function hostClipboardImagePaste(pi: ExtensionAPI) {
  let activeCtx: UiContext | undefined;

  pi.registerCommand("host-image", {
    description: "Paste image from the connecting host clipboard bridge",
    handler: async (_args, ctx) => Effect.runPromise(pasteFromHost(pi, ctx)),
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    activeCtx = ctx;

    if (AUTO_START) {
      Effect.runPromise(
        pipe(
          ensureHostBridge(pi),
          Effect.catchAll((error) =>
            Effect.sync(() => ctx.ui.notify(`Host clipboard bridge autostart failed: ${error.message}`, "warning")),
          ),
        ),
      ).catch(() => undefined);
    }

    ctx.ui.onTerminalInput((data) => {
      if (!isCtrlV(data)) return undefined;
      void Effect.runPromise(pasteFromHost(pi, activeCtx ?? ctx));
      return { consume: true };
    });
  });
}
