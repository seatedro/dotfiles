import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MAX_OSC_BYTES = 30 * 1024 * 1024;

function extensionForMime(mime: string | undefined): string {
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
}

function parseParams(text: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const part of text.split(";")) {
    const index = part.indexOf("=");
    if (index > 0) params[part.slice(0, index)] = part.slice(index + 1);
  }
  return params;
}

function safeName(name: string | undefined, fallbackExt: string): string {
  if (!name) return `pi-osc-image-${randomUUID()}.${fallbackExt}`;
  const base = basename(name).replace(/[^A-Za-z0-9._-]/g, "_");
  if (!base || base === "." || base === "..") return `pi-osc-image-${randomUUID()}.${fallbackExt}`;
  return extname(base) ? base : `${base}.${fallbackExt}`;
}

function decodeMaybeBase64(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    if (decoded && /^[\x20-\x7e]+$/.test(decoded)) return decoded;
  } catch {}
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function findTerminator(buffer: string, start: number): { index: number; length: number } | undefined {
  const bel = buffer.indexOf("\x07", start);
  const st = buffer.indexOf("\x1b\\", start);
  if (bel === -1 && st === -1) return undefined;
  if (bel !== -1 && (st === -1 || bel < st)) return { index: bel, length: 1 };
  return { index: st, length: 2 };
}

function parseOscPayload(sequence: string): { name?: string; mime: string; bytes: Buffer } | undefined {
  // iTerm2 inline file format:
  //   ESC ] 1337 ; File=name=<base64>;inline=1;size=...:<base64-bytes> BEL/ST
  const itermPrefix = "\x1b]1337;File=";
  if (sequence.startsWith(itermPrefix)) {
    const body = sequence.slice(itermPrefix.length);
    const colon = body.indexOf(":");
    if (colon < 0) return undefined;
    const params = parseParams(body.slice(0, colon));
    const bytes = Buffer.from(body.slice(colon + 1).replace(/\s+/g, ""), "base64");
    const name = decodeMaybeBase64(params.name);
    const mime = params.mime || "image/png";
    return bytes.length > 0 ? { name, mime, bytes } : undefined;
  }

  // Pi private paste format:
  //   ESC ] 777 ; pi-image-paste;name=<url-or-b64>;mime=image/png:<base64-bytes> BEL/ST
  const piPrefix = "\x1b]777;pi-image-paste;";
  if (sequence.startsWith(piPrefix)) {
    const body = sequence.slice(piPrefix.length);
    const colon = body.indexOf(":");
    if (colon < 0) return undefined;
    const params = parseParams(body.slice(0, colon));
    const bytes = Buffer.from(body.slice(colon + 1).replace(/\s+/g, ""), "base64");
    const name = decodeMaybeBase64(params.name);
    const mime = params.mime || "image/png";
    return bytes.length > 0 ? { name, mime, bytes } : undefined;
  }

  return undefined;
}

export default function oscImagePaste(pi: ExtensionAPI) {
  let buffer = "";


  pi.registerCommand("osc-image-paste-help", {
    description: "Show local helper instructions for image paste over SSH",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        `Local helper created at ~/.pi/agent/helpers/pi-image-paste-local on this machine. Copy that script to your LOCAL computer, run it locally, then paste into this SSH/Pi terminal. It sends OSC 777 pi-image-paste data that this extension receives.`,
        "info",
      );
    },
  });

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;

    ctx.ui.onTerminalInput((data) => {
      const hasStart = data.includes("\x1b]1337;File=") || data.includes("\x1b]777;pi-image-paste;");
      if (!buffer && !hasStart) return undefined;

      buffer += data;
      if (buffer.length > MAX_OSC_BYTES) {
        buffer = "";
        ctx.ui.notify("OSC image paste was too large; dropped.", "warning");
        return { consume: true };
      }

      let wrote = 0;
      while (true) {
        const starts = [buffer.indexOf("\x1b]1337;File="), buffer.indexOf("\x1b]777;pi-image-paste;")].filter(
          (index) => index >= 0,
        );
        if (starts.length === 0) {
          buffer = "";
          break;
        }
        const start = Math.min(...starts);
        const terminator = findTerminator(buffer, start);
        if (!terminator) {
          if (start > 0) buffer = buffer.slice(start);
          break;
        }

        const sequence = buffer.slice(start, terminator.index);
        buffer = buffer.slice(terminator.index + terminator.length);
        const parsed = parseOscPayload(sequence);
        if (!parsed) continue;

        const ext = extensionForMime(parsed.mime);
        const fileName = safeName(parsed.name, ext);
        const filePath = join(tmpdir(), fileName);
        writeFileSync(filePath, parsed.bytes);
        ctx.ui.pasteToEditor(`${filePath} `);
        wrote += 1;
      }

      if (wrote > 0) ctx.ui.notify(`Pasted ${wrote} image${wrote === 1 ? "" : "s"} via OSC.`, "info");
      return { consume: true };
    });
  });
}
