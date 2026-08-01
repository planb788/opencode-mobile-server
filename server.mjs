import { createReadStream, promises as fs } from "node:fs";
import { createServer } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const BASE_PATH = "/opencode";
const API_PATH = "/opencode/api";
const HOST = process.env.OPENCODE_WEB_HOST || "127.0.0.1";
const PORT = Number(process.env.OPENCODE_WEB_PORT || 8787);
const API_URL = new URL(process.env.OPENCODE_API_URL || "http://127.0.0.1:4096");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers });
  res.end(body);
}

function requestPath(req) {
  return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
}

function proxyApi(req, res, url) {
  const path = url.pathname.slice(API_PATH.length) || "/";
  const target = new URL(path + url.search, API_URL);
  const transport = target.protocol === "https:" ? httpsRequest : httpRequest;
  const headers = { ...req.headers, host: target.host };
  delete headers.connection;

  const upstream = transport(target, {
    method: req.method,
    headers,
  });

  upstream.on("response", (response) => {
    const headers = { ...response.headers };
    // Let the web UI show its own login screen instead of triggering the browser's Basic Auth dialog.
    delete headers["www-authenticate"];
    res.writeHead(response.statusCode || 502, headers);
    response.pipe(res);
  });
  upstream.on("error", (error) => {
    if (!res.headersSent) send(res, 502, `OpenCode API unavailable: ${error.message}`);
    else res.destroy();
  });
  req.on("aborted", () => upstream.destroy());
  req.pipe(upstream);
}

async function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
    return;
  }

  if (url.pathname === "/") {
    res.writeHead(302, { Location: `${BASE_PATH}/` });
    res.end();
    return;
  }
  if (url.pathname === BASE_PATH) {
    res.writeHead(301, { Location: `${BASE_PATH}/` });
    res.end();
    return;
  }
  if (!url.pathname.startsWith(`${BASE_PATH}/`)) {
    send(res, 404, "Not Found");
    return;
  }

  let relative;
  try {
    relative = decodeURIComponent(url.pathname.slice(BASE_PATH.length + 1)) || "index.html";
  } catch {
    send(res, 400, "Bad Request");
    return;
  }

  const file = resolve(ROOT, relative);
  if (file !== ROOT && !file.startsWith(`${ROOT}${sep}`)) {
    send(res, 403, "Forbidden");
    return;
  }

  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    send(res, 404, "Not Found");
    return;
  }
  if (!stat.isFile()) {
    send(res, 404, "Not Found");
    return;
  }

  const headers = {
    "Content-Type": MIME_TYPES[extname(file).toLowerCase()] || "application/octet-stream",
    "Content-Length": stat.size,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": file.endsWith("index.html") ? "no-cache" : "public, max-age=3600",
  };
  res.writeHead(200, headers);
  if (req.method === "HEAD") res.end();
  else createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  const url = requestPath(req);
  if (url.pathname === API_PATH || url.pathname.startsWith(`${API_PATH}/`)) {
    proxyApi(req, res, url);
    return;
  }
  serveStatic(req, res, url).catch((error) => {
    if (!res.headersSent) send(res, 500, `Web server error: ${error.message}`);
    else res.destroy();
  });
});

server.on("error", (error) => {
  console.error(`Unable to start web gateway on ${HOST}:${PORT}: ${error.message}`);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`OpenCode Mobile Server: http://${HOST}:${PORT}${BASE_PATH}/`);
  console.log(`OpenCode API target: ${API_URL.origin}`);
});
