#!/usr/bin/env node
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const host = process.env.PI_HOST_CLIPBOARD_BIND || "0.0.0.0";
const port = Number(process.env.PI_HOST_CLIPBOARD_PORT || "17653");

function commandExists(cmd) {
  return spawnSync("/bin/sh", ["-lc", `command -v ${cmd}`], { stdio: "ignore" }).status === 0;
}

function run(cmd, args, options = {}) {
  try {
    const result = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "ignore"], timeout: 5000, ...options });
    if (result.status === 0 && result.stdout?.length) return result.stdout;
  } catch {
    // ignore
  }
  return undefined;
}

function readMacClipboardImage() {
  const dir = mkdtempSync(join(tmpdir(), "pi-clip-"));
  const path = join(dir, "clipboard.png");
  try {
    if (commandExists("pngpaste")) {
      const result = spawnSync("pngpaste", [path], { stdio: "ignore", timeout: 5000 });
      if (result.status === 0) return { mime: "image/png", bytes: readFileSync(path) };
    }

    const script = `
set outPath to POSIX file "${path.replaceAll('"', '\\"')}"
try
  set pngData to the clipboard as «class PNGf»
  set f to open for access outPath with write permission
  set eof f to 0
  write pngData to f
  close access f
on error errMsg
  try
    close access outPath
  end try
  error errMsg
end try
`;
    const result = spawnSync("osascript", ["-e", script], { stdio: "ignore", timeout: 5000 });
    if (result.status === 0) return { mime: "image/png", bytes: readFileSync(path) };
    return undefined;
  } catch {
    return undefined;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readWaylandClipboardImage() {
  if (!commandExists("wl-paste")) return undefined;
  const types = run("wl-paste", ["--list-types"], { timeout: 1000 })?.toString("utf8");
  const defaults = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  const available = new Set(types?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) ?? []);
  const candidates = [...defaults.filter((mime) => available.has(mime)), ...defaults];
  for (const mime of candidates) {
    const bytes = run("wl-paste", ["--type", mime, "--no-newline"], { timeout: 3000 });
    if (bytes?.length) return { mime, bytes };
  }
  return undefined;
}

function readX11ClipboardImage() {
  if (!commandExists("xclip")) return undefined;
  for (const mime of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
    const bytes = run("xclip", ["-selection", "clipboard", "-t", mime, "-o"], { timeout: 3000 });
    if (bytes?.length) return { mime, bytes };
  }
  return undefined;
}

function readClipboardImage() {
  if (process.platform === "darwin") return readMacClipboardImage();
  if (process.platform === "linux") return readWaylandClipboardImage() || readX11ClipboardImage();
  return undefined;
}

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.url !== "/image") {
    res.writeHead(404).end();
    return;
  }

  const image = readClipboardImage();
  if (!image?.bytes?.length) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "no image on clipboard" }));
    return;
  }

  const body = JSON.stringify({ mime: image.mime, data: image.bytes.toString("base64") });
  res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
});

server.listen(port, host, () => {
  console.error(`Pi host clipboard server listening on http://${host}:${port}`);
});
