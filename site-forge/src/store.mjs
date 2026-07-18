import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config, redact, safeError } from "./config.mjs";

export class JobStore {
  constructor() {
    this.jobs = new Map();
    this.subscribers = new Map();
    this.jobsFile = join(config.dataDir, "jobs.json");
  }

  async initialise() {
    await mkdir(config.dataDir, { recursive: true });
    await mkdir(config.workspaceDir, { recursive: true });
    await this.restore();
  }

  create({ prompt, requestedRepoName, privateRepository }) {
    const now = new Date().toISOString();
    const job = {
      id: randomUUID(),
      status: "queued",
      stage: "queued",
      progress: 0,
      prompt,
      requestedRepoName,
      privateRepository,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      logs: [{ at: now, level: "info", message: "Build queued." }],
      result: null,
      error: null,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id) {
    return this.jobs.get(id);
  }

  list() {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async update(job, stage, progress, message) {
    job.stage = stage;
    job.progress = progress;
    job.updatedAt = new Date().toISOString();
    this.log(job, "info", message);
    await this.persist();
    this.emit(job.id, { type: "job.updated", job: this.public(job) });
  }

  async complete(job, result) {
    job.status = "completed";
    job.stage = "completed";
    job.progress = 100;
    job.completedAt = new Date().toISOString();
    job.result = result;
    this.log(job, "success", "Website published successfully.");
    await this.persist();
    this.emit(job.id, { type: "job.completed", job: this.public(job) });
  }

  async fail(job, error) {
    job.status = "failed";
    job.stage = "failed";
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    job.error = safeError(error);
    this.log(job, "error", job.error);
    await this.persist();
    this.emit(job.id, { type: "job.failed", job: this.public(job) });
  }

  log(job, level, message) {
    const entry = {
      at: new Date().toISOString(),
      level,
      message: redact(message).slice(0, 4000),
    };
    job.logs.push(entry);
    if (job.logs.length > 300) job.logs = job.logs.slice(-300);
    job.updatedAt = entry.at;
    this.emit(job.id, { type: "log", entry });
  }

  public(job) {
    return {
      id: job.id,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      prompt: job.prompt,
      requestedRepoName: job.requestedRepoName,
      privateRepository: job.privateRepository,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      logs: job.logs,
      result: job.result,
      error: job.error,
    };
  }

  subscribe(id, request, response) {
    const job = this.get(id);
    if (!job) return false;
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.write(`event: snapshot\ndata: ${JSON.stringify(this.public(job))}\n\n`);
    const set = this.subscribers.get(id) || new Set();
    set.add(response);
    this.subscribers.set(id, set);
    const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15000);
    request.on("close", () => {
      clearInterval(heartbeat);
      set.delete(response);
      if (!set.size) this.subscribers.delete(id);
    });
    return true;
  }

  emit(id, payload) {
    const set = this.subscribers.get(id);
    if (!set) return;
    for (const response of set) response.write(`event: update\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  async persist() {
    const serialised = [...this.jobs.values()].map(({ workspace, ...job }) => job);
    const temporary = `${this.jobsFile}.tmp`;
    await writeFile(temporary, JSON.stringify(serialised, null, 2), "utf8");
    await rename(temporary, this.jobsFile);
  }

  async restore() {
    try {
      const raw = JSON.parse(await readFile(this.jobsFile, "utf8"));
      for (const job of raw) {
        if (["queued", "running"].includes(job.status)) {
          job.status = "failed";
          job.stage = "failed";
          job.error = "The service restarted before this build completed.";
          job.completedAt = new Date().toISOString();
        }
        this.jobs.set(job.id, job);
      }
    } catch (error) {
      if (error.code !== "ENOENT") console.warn("Could not restore jobs:", error.message);
    }
  }
}
