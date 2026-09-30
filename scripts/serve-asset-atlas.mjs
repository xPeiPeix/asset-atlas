import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAssetAtlasBackend } from "../server/asset-atlas-backend.mjs";
import { loadPrivatePassword } from "./private-password.mjs";

function createAssetAtlasRequestHandler({ htmlPath, backend = null }) {
  return async (request, response) => {
    let pathname;
    try { pathname = new URL(request.url, "http://localhost").pathname; }
    catch {
      response.writeHead(400).end("Invalid request");
      return;
    }
    if (backend && pathname.startsWith("/api/")) return backend(request, response);
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    if (!["/", "/asset-atlas.html"].includes(pathname)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    try {
      const html = await readFile(htmlPath);
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": html.length,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : html);
    } catch {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end(`Build the Atlas first: npm run ${backend ? "build:private" : "build"}`);
    }
  };
}

async function startFromEnvironment() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.some((argument) => argument !== "--private")) throw new Error("Usage: node scripts/serve-asset-atlas.mjs [--private]");
  const privateMode = arguments_.includes("--private");
  const port = Number(process.env.ASSET_ATLAS_PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("ASSET_ATLAS_PORT must be an integer between 1 and 65535.");
  }
  const host = process.env.ASSET_ATLAS_HOST ?? "127.0.0.1";
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const privateDirectory = path.join(projectRoot, ".asset-atlas");
  const htmlPath = privateMode ? path.join(privateDirectory, "index.html") : path.join(projectRoot, "asset-atlas.html");
  let backend = null;
  if (privateMode) {
    const password = await loadPrivatePassword(process.env.ASSET_ATLAS_PASSWORD_FILE ?? path.join(privateDirectory, "password"));
    backend = createAssetAtlasBackend({
      dataPath: path.join(privateDirectory, "data.json"),
      locksPath: path.join(privateDirectory, "locks.json"),
      password,
      secureCookies: process.env.ASSET_ATLAS_SECURE_COOKIE === "1",
    });
  }
  const server = createServer(createAssetAtlasRequestHandler({ htmlPath, backend }));
  server.listen(port, host, () => {
    process.stdout.write(`Asset Atlas: http://${host.includes(":") ? `[${host}]` : host}:${port}\nPress Ctrl+C to stop. ${privateMode ? "Protected cards require the local password." : "Only the generated HTML is served."}\n`);
  });
}

if (process.argv[1] && await realpath(process.argv[1]).catch(() => "") === fileURLToPath(import.meta.url)) {
  await startFromEnvironment();
}

export { createAssetAtlasRequestHandler };
