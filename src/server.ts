import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

/**
 * Zero-dependency static server. Serves public/index.html and the compiled ESM in
 * dist/ so the browser can import the game modules directly (no bundler needed).
 * Run:  pnpm run build && pnpm start   (or `pnpm run play`)
 */

const ROOT = process.cwd();
const PORT = Number(process.env.PORT ?? 8080);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".ttf": "font/ttf",
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (urlPath === "/") urlPath = "/public/index.html";

    // prevent path traversal
    const filePath = normalize(join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    // Vite serves public/ at the root, so the page asks for /mega-man-x.ttf while
    // the file is at public/mega-man-x.ttf. Falling back to public/ on a miss lets
    // one URL — and so one @font-face rule — work under both entry points.
    const data = await readFile(filePath).catch(async (error: unknown) => {
      const fallback = normalize(join(ROOT, "public", urlPath));
      if (!fallback.startsWith(ROOT)) throw error;
      return await readFile(fallback);
    });
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`\n  Mega Man X gameplay core running at  http://localhost:${PORT}\n`);
});
