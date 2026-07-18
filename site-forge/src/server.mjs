import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { config, publicDir, safeError, sanitiseRepoName } from "./config.mjs";
import { JobStore } from "./store.mjs";
import { runBuild } from "./orchestrator.mjs";

const store = new JobStore();
await store.initialise();

const queue = [];
let activeJobs = 0;

const server = createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { error: safeError(error) });
    else response.end();
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Site Forge listening at http://${config.host}:${config.port}`);
});

async function route(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    return sendJson(response, 200, { ok: true, queued: queue.length, active: activeJobs });
  }

  if (!url.pathname.startsWith("/api/")) return serveStatic(url.pathname, response);
  if (!authorised(request, url)) return sendJson(response, 401, { error: "Unauthorised" });

  if (request.method === "GET" && url.pathname === "/api/config") {
    return sendJson(response, 200, {
      ready: Boolean(config.codexApiKey && config.githubToken && config.githubOwner && config.vercelToken),
      credentials: {
        codex: Boolean(config.codexApiKey),
        github: Boolean(config.githubToken && config.githubOwner),
        vercel: Boolean(config.vercelToken),
      },
      defaults: { privateRepository: config.githubDefaultPrivate },
    });
  }

  if (request.method === "GET" && url.pathname === "/api/builds") {
    return sendJson(response, 200, store.list().map((job) => store.public(job)));
  }

  if (request.method === "POST" && url.pathname === "/api/builds") {
    const body = await readJsonBody(request);
    const prompt = String(body.prompt || "").trim();
    if (prompt.length < 12) return sendJson(response, 400, { error: "Please provide a more specific website prompt." });
    if (prompt.length > 12000) return sendJson(response, 400, { error: "Prompt is too long." });

    const job = store.create({
      prompt,
      requestedRepoName: sanitiseRepoName(body.repoName || ""),
      privateRepository: typeof body.privateRepository === "boolean"
        ? body.privateRepository
        : config.githubDefaultPrivate,
    });
    queue.push(job.id);
    await store.persist();
    drainQueue();
    return sendJson(response, 202, store.public(job));
  }

  const eventMatch = url.pathname.match(/^\/api\/builds\/([a-f0-9-]+)\/events$/);
  if (request.method === "GET" && eventMatch) {
    if (!store.subscribe(eventMatch[1], request, response)) {
      return sendJson(response, 404, { error: "Build not found." });
    }
    return;
  }

  const buildMatch = url.pathname.match(/^\/api\/builds\/([a-f0-9-]+)$/);
  if (request.method === "GET" && buildMatch) {
    const job = store.get(buildMatch[1]);
    return job
      ? sendJson(response, 200, store.public(job))
      : sendJson(response, 404, { error: "Build not found." });
  }

  return sendJson(response, 404, { error: "Not found" });
}

async function drainQueue() {
  while (activeJobs < config.maxConcurrent && queue.length) {
    const id = queue.shift();
    const job = store.get(id);
    if (!job || job.status !== "queued") continue;
    activeJobs += 1;
    runBuild(job, store)
      .catch((error) => store.fail(job, error))
      .finally(() => {
        activeJobs -= 1;
        drainQueue();
      });
  }
}

function authorised(request, url) {
  if (!config.accessToken) return true;
  const bearer = request.headers.authorization || "";
  const supplied = bearer.startsWith("Bearer ")
    ? bearer.slice(7)
    : request.headers["x-site-forge-token"] || url.searchParams.get("token") || "";
  return supplied === config.accessToken;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 256 * 1024) throw new Error("Request body too large.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = normalize(join(publicDir, requested));
  if (filePath !== publicDir && !filePath.startsWith(`${publicDir}${sep}`)) {
    return sendJson(response, 403, { error: "Forbidden" });
  }

  const extension = extname(filePath);
  const stream = createReadStream(filePath);
  stream.once("open", () => {
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    });
    stream.pipe(response);
  });
  stream.once("error", () => sendJson(response, 404, { error: "Not found" }));
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
