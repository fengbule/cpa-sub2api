import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const port = Number(process.env.PORT || 4173);
const root = process.cwd();

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendNotFound(response) {
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not Found");
}

function sendFile(response, filePath) {
  const ext = extname(filePath).toLowerCase();
  const type = contentTypes[ext] || "application/octet-stream";
  response.writeHead(200, { "Content-Type": type });
  createReadStream(filePath).pipe(response);
}

createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = resolve(join(root, `.${safePath}`));

  if (!absolutePath.startsWith(resolve(root))) {
    sendNotFound(response);
    return;
  }

  if (!existsSync(absolutePath)) {
    sendNotFound(response);
    return;
  }

  const stats = statSync(absolutePath);
  if (stats.isDirectory()) {
    const indexPath = join(absolutePath, "index.html");
    if (!existsSync(indexPath)) {
      sendNotFound(response);
      return;
    }

    sendFile(response, indexPath);
    return;
  }

  sendFile(response, absolutePath);
}).listen(port, "127.0.0.1", () => {
  console.log(`Static server running at http://127.0.0.1:${port}`);
});
