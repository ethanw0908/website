import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const rootDir = resolve(here, "..");
export const publicDir = join(rootDir, "public");

await loadEnvironmentFile(process.env.SITEFORGE_ENV_FILE || "/etc/site-forge/site-forge.env");

export const config = {
  host: process.env.SITEFORGE_HOST || "127.0.0.1",
  port: positiveInteger(process.env.SITEFORGE_PORT, 8787),
  accessToken: process.env.SITEFORGE_ACCESS_TOKEN || "",
  dataDir: resolve(process.env.SITEFORGE_DATA_DIR || join(rootDir, "data")),
  workspaceDir: resolve(process.env.SITEFORGE_WORKSPACE_DIR || join(rootDir, "workspaces")),
  maxConcurrent: positiveInteger(process.env.SITEFORGE_MAX_CONCURRENT, 1),
  commandTimeoutMs: positiveInteger(process.env.SITEFORGE_COMMAND_TIMEOUT_MS, 15 * 60 * 1000),
  githubToken: process.env.GITHUB_TOKEN || "",
  githubOwner: process.env.GITHUB_OWNER || "",
  githubOwnerType: (process.env.GITHUB_OWNER_TYPE || "user").toLowerCase(),
  githubDefaultPrivate: parseBoolean(process.env.GITHUB_DEFAULT_PRIVATE, true),
  vercelToken: process.env.VERCEL_TOKEN || "",
  vercelTeamId: process.env.VERCEL_TEAM_ID || "",
  codexApiKey: process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY || "",
  codexModel: process.env.SITEFORGE_CODEX_MODEL || "",
};

if (!isLoopback(config.host) && !config.accessToken) {
  throw new Error("SITEFORGE_ACCESS_TOKEN is required when binding outside localhost.");
}
if (!["user", "org"].includes(config.githubOwnerType)) {
  throw new Error("GITHUB_OWNER_TYPE must be user or org.");
}

export function assertCredentials() {
  const missing = [];
  if (!config.codexApiKey) missing.push("CODEX_API_KEY or OPENAI_API_KEY");
  if (!config.githubToken) missing.push("GITHUB_TOKEN");
  if (!config.githubOwner) missing.push("GITHUB_OWNER");
  if (!config.vercelToken) missing.push("VERCEL_TOKEN");
  if (missing.length) throw new Error(`Missing server credentials: ${missing.join(", ")}`);
}

export function sanitiseRepoName(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/[-_.]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 80);
}

export function sanitiseVercelName(value) {
  return sanitiseRepoName(value).replace(/[._]/g, "-").slice(0, 52) || `site-${Date.now()}`;
}

export function redact(value) {
  let text = String(value);
  const secrets = [config.githubToken, config.vercelToken, config.codexApiKey, config.accessToken].filter(Boolean);
  for (const secret of secrets) text = text.split(secret).join("[redacted]");
  return text;
}

export function safeError(error) {
  return redact(error?.message || error || "Unknown error").slice(0, 4000);
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (value == null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function isLoopback(host) {
  return ["127.0.0.1", "::1", "localhost"].includes(host);
}

async function loadEnvironmentFile(file) {
  try {
    const content = await readFile(file, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
