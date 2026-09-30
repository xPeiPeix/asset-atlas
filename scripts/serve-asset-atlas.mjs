import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const port = Number(process.env.ASSET_ATLAS_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("ASSET_ATLAS_PORT must be an integer between 1 and 65535.");
}
const htmlPath = new URL("../asset-atlas.html", import.meta.url);
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
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
    });
    response.end(request.method === "HEAD" ? undefined : html);
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("Build the Atlas first: npm run build");
  }
});
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Asset Atlas: http://127.0.0.1:${port}\nPress Ctrl+C to stop. Only the generated HTML is served.\n`);
});
