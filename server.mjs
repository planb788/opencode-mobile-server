import { createReadStream, promises as fs } from "node:fs";
import { createServer } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const BASE_PATH = "/opencode";
const API_PATH = "/opencode/api";
const HOST = process.env.OPENCODE_WEB_HOST || "127.0.0.1";
const PORT = Number(process.env.OPENCODE_WEB_PORT || 8787);
const API_URL = new URL(process.env.OPENCODE_API_URL || "http://127.0.0.1:4096");

/* ---------- api key management ---------- */
const SERVER_PASSWORD = process.env.OPENCODE_SERVER_PASSWORD || "opencode";
const SERVICE_NAME = process.env.OPENCODE_SERVICE_NAME ?? "opencode-server.service";
const CAN_RESTART = process.platform === "linux" && SERVICE_NAME !== "none";
const AUTH_FILE = resolve(process.env.OPENCODE_AUTH_FILE || detectAuthFile());
const AUTH_KEYS_FILE = resolve(process.env.OPENCODE_AUTH_KEYS_FILE || join(ROOT, ".auth-keys.json"));

function detectAuthFile() {
  const home = os.homedir();
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "opencode", "auth.json");
  }
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support", "opencode", "auth.json");
  }
  return join(process.env.XDG_DATA_HOME || join(home, ".local", "share"), "opencode", "auth.json");
}

function basicAuthOk(req) {
  const m = (req.headers.authorization || "").match(/^Basic\s+(.+)$/i);
  if (!m) return false;
  let decoded;
  try { decoded = Buffer.from(m[1], "base64").toString("utf8"); } catch { return false; }
  const idx = decoded.indexOf(":");
  return idx >= 0 && decoded.slice(idx + 1) === SERVER_PASSWORD;
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}
async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function emptyKeysStore() {
  return { version: 1, active: {}, providers: {} };
}
async function readKeysStore() {
  const store = await readJson(AUTH_KEYS_FILE, null);
  if (store && store.version === 1 && store.providers) return store;
  return emptyKeysStore();
}
async function writeKeysStore(store) {
  await writeJson(AUTH_KEYS_FILE, store);
}
async function readAuth() {
  return readJson(AUTH_FILE, {});
}
async function applyAuthKey(provider, key) {
  const auth = await readAuth();
  if (auth[provider]) {
    try { await fs.writeFile(AUTH_FILE + ".bak", JSON.stringify(auth, null, 2), { mode: 0o600 }); } catch {}
  }
  auth[provider] = { type: "api", key };
  await writeJson(AUTH_FILE, auth);
}
function maskKey(key) {
  if (!key) return "";
  if (key.length <= 10) return "****";
  return key.slice(0, 6) + "…" + key.slice(-4);
}
function restartOpenCode() {
  return new Promise((resolve) => {
    if (!CAN_RESTART) {
      resolve({ ok: false, message: "密钥已写入 auth 文件，请手动重启 OpenCode 服务（Windows: 关闭并重新运行 start-windows.ps1；Linux: systemctl restart " + SERVICE_NAME + "）" });
      return;
    }
    const child = spawn("systemctl", ["restart", SERVICE_NAME], { stdio: "ignore" });
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      if (err) resolve({ ok: false, message: "重启 OpenCode 服务失败: " + err });
      else waitForApiReady().then((ready) => resolve(ready ? { ok: true, message: "OpenCode 服务已重启" } : { ok: false, message: "OpenCode 服务重启后未就绪，请稍后刷新页面" }));
    };
    child.on("error", (e) => finish(e.message));
    child.on("exit", (code) => finish(code === 0 ? null : "systemctl 退出码 " + code));
    setTimeout(() => finish("systemctl 超时"), 25000);
  });
}
function waitForApiReady() {
  return new Promise((resolve) => {
    const host = API_URL.hostname;
    const port = Number(API_URL.port || 80);
    const deadline = Date.now() + 15000;
    const tryConnect = () => {
      if (Date.now() > deadline) { resolve(false); return; }
      const sock = connect({ host, port });
      sock.once("connect", () => { sock.destroy(); resolve(true); });
      sock.once("error", () => { sock.destroy(); setTimeout(tryConnect, 500); });
    };
    tryConnect();
  });
}
function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data), { "Content-Type": "application/json; charset=utf-8" });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}
async function handleAuthKeys(req, res) {
  if (!basicAuthOk(req)) {
    sendJson(res, 401, { ok: false, message: "Unauthorized" });
    return;
  }
  if (req.method === "GET") {
    const [store, auth] = await Promise.all([readKeysStore(), readAuth()]);
    const providers = [];
    for (const id of new Set([...Object.keys(store.providers), ...Object.keys(auth)])) {
      const activeKey = auth[id] && auth[id].type === "api" ? auth[id].key : null;
      let keys = (store.providers[id] || []).map((k) => ({
        id: k.id,
        label: k.label,
        createdAt: k.createdAt,
        masked: maskKey(k.key),
        active: Boolean(activeKey && k.key === activeKey),
      }));
      if (activeKey && !keys.some((k) => k.active)) {
        keys.unshift({ id: "external", label: "当前生效密钥", masked: maskKey(activeKey), active: true, external: true });
      }
      keys = keys.sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0));
      providers.push({ id, keys });
    }
    providers.sort((a, b) => a.id.localeCompare(b.id));
    sendJson(res, 200, { restartable: CAN_RESTART, service: SERVICE_NAME, providers });
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, message: "Method Not Allowed" });
    return;
  }
  let body;
  try { body = await readBody(req); } catch (e) { sendJson(res, 400, { ok: false, message: e.message }); return; }
  const action = body.action;
  const provider = String(body.provider || "").trim();
  const store = await readKeysStore();
  if (action === "save") {
    const key = String(body.key || "").trim();
    if (!provider || !key) { sendJson(res, 400, { ok: false, message: "provider 和 key 不能为空" }); return; }
    const entry = { id: randomUUID(), label: String(body.label || "").trim(), key, createdAt: Date.now() };
    store.providers[provider] = store.providers[provider] || [];
    store.providers[provider].push(entry);
    store.active[provider] = entry.id;
    await writeKeysStore(store);
    await applyAuthKey(provider, key);
    const restarted = await restartOpenCode();
    sendJson(res, 200, { ok: true, restarted: restarted.ok, message: restarted.message, provider });
    return;
  }
  if (action === "activate") {
    const id = String(body.id || "");
    const entry = (store.providers[provider] || []).find((k) => k.id === id);
    if (!entry) { sendJson(res, 404, { ok: false, message: "密钥不存在" }); return; }
    store.active[provider] = id;
    await writeKeysStore(store);
    await applyAuthKey(provider, entry.key);
    const restarted = await restartOpenCode();
    sendJson(res, 200, { ok: true, restarted: restarted.ok, message: restarted.message, provider });
    return;
  }
  if (action === "delete") {
    const id = String(body.id || "");
    if (provider && store.providers[provider]) {
      store.providers[provider] = store.providers[provider].filter((k) => k.id !== id);
      if (!store.providers[provider].length) delete store.providers[provider];
      if (store.active[provider] === id) delete store.active[provider];
      await writeKeysStore(store);
    }
    sendJson(res, 200, { ok: true, message: "已删除（不影响当前生效密钥）" });
    return;
  }
  sendJson(res, 400, { ok: false, message: "未知操作: " + action });
}

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
  if (!basicAuthOk(req)) {
    sendJson(res, 401, { ok: false, message: "Unauthorized" });
    return;
  }
  const path = url.pathname.slice(API_PATH.length) || "/";
  const target = new URL(path + url.search, API_URL);
  const transport = target.protocol === "https:" ? httpsRequest : httpRequest;
  const headers = { ...req.headers, host: target.host };
  delete headers.connection;
  if (path === "/event" || path === "/global/event") {
    // Compression can buffer several SSE frames before emitting a block.
    // Ask OpenCode for the raw event stream so each delta can pass through.
    headers.accept = "text/event-stream";
    delete headers["accept-encoding"];
    headers["cache-control"] = "no-cache";
  }

  const upstream = transport(target, {
    method: req.method,
    headers,
  });

  upstream.on("response", (response) => {
    const headers = { ...response.headers };
    // Let the web UI show its own login screen instead of triggering the browser's Basic Auth dialog.
    delete headers["www-authenticate"];
    // Keep SSE responses incremental through this gateway and common reverse proxies.
    const isEventStream = (headers["content-type"] || "").includes("text/event-stream");
    if (isEventStream) {
      headers["cache-control"] = "no-cache, no-transform";
      headers["x-accel-buffering"] = "no";
      delete headers["content-length"];
    }
    res.writeHead(response.statusCode || 502, headers);
    if (!isEventStream) {
      response.pipe(res);
      return;
    }

    // Flush the headers before the first model event. This matters when this
    // gateway is itself behind a reverse proxy and prevents the proxy from
    // treating the long-lived response like a normal buffered API response.
    res.flushHeaders();
    response.on("data", (chunk) => {
      if (!res.write(chunk)) response.pause();
    });
    response.on("end", () => res.end());
    response.on("error", () => {
      if (!res.destroyed) res.destroy();
    });
    res.on("drain", () => response.resume());
    res.on("close", () => {
      if (!response.complete) response.destroy();
    });
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
  if (url.pathname === `${API_PATH}/auth-keys`) {
    handleAuthKeys(req, res).catch((error) => {
      if (!res.headersSent) sendJson(res, 500, { ok: false, message: "Server error: " + error.message });
      else res.destroy();
    });
    return;
  }
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
