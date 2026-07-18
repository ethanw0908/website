import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Codex } from "@openai/codex-sdk";
import { assertCredentials, config } from "./config.mjs";
import { createAndPushRepository, deployToVercel, runCommand } from "./integrations.mjs";
import { agentInstructions, buildPrompt, critiquePrompt, repairPrompt } from "./prompts.mjs";

export async function runBuild(job, store) {
  assertCredentials();
  job.status = "running";
  job.startedAt = new Date().toISOString();
  await store.update(job, "preparing", 4, "Preparing an isolated Git workspace.");

  const workspace = await mkdtemp(join(config.workspaceDir, `site-forge-${job.id.slice(0, 8)}-`));
  job.workspace = workspace;

  try {
    await runCommand("git", ["init", "-b", "main"], { cwd: workspace });
    await runCommand("git", ["config", "user.name", "Site Forge"], { cwd: workspace });
    await runCommand("git", ["config", "user.email", "site-forge@localhost"], { cwd: workspace });
    await writeFile(join(workspace, "AGENTS.md"), agentInstructions(), "utf8");

    await store.update(job, "generating", 14, "Codex is turning the prompt into a complete website.");
    const codex = new Codex({
      env: {
        ...process.env,
        CODEX_API_KEY: config.codexApiKey,
        OPENAI_API_KEY: config.codexApiKey,
      },
    });
    const thread = codex.startThread({
      workingDirectory: workspace,
      skipGitRepoCheck: false,
      sandboxMode: "workspace-write",
      ...(config.codexModel ? { model: config.codexModel } : {}),
    });

    await runCodexTurn(thread, buildPrompt(job.prompt), job, store);
    await store.update(job, "refining", 38, "Codex is auditing the design and improving weak areas.");
    await runCodexTurn(thread, critiquePrompt(), job, store);

    await store.update(job, "installing", 55, "Installing the generated website dependencies.");
    await runCommand("npm", ["install", "--no-audit", "--no-fund"], { cwd: workspace });

    await store.update(job, "validating", 66, "Running the production build and repairing any failures.");
    const buildOutput = await buildWithRepairs({ thread, workspace, job, store });
    store.log(job, "info", compactBuildSummary(buildOutput));

    await store.update(job, "publishing", 78, "Creating the GitHub repository and pushing the validated source.");
    const published = await createAndPushRepository({ workspace, job, store });

    await store.update(job, "deploying", 88, "Connecting the repository to Vercel and starting production deployment.");
    const deployed = await deployToVercel({ ...published, job, store });

    await store.complete(job, {
      repository: published.repo.html_url,
      repositoryName: published.repo.full_name,
      deployment: deployed.deployment,
      vercelProject: deployed.vercelProject,
      commit: published.commit,
    });
  } finally {
    delete job.workspace;
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

async function buildWithRepairs({ thread, workspace, job, store }) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await runCommand("npm", ["run", "build"], {
        cwd: workspace,
        captureLimit: 24000,
      });
      return result.output;
    } catch (error) {
      if (attempt === 3) throw error;
      const log = String(error.output || error.message || error).slice(-18000);
      store.log(job, "warn", `Production build failed on attempt ${attempt}; Codex is repairing it.`);
      await runCodexTurn(thread, repairPrompt(log), job, store);
    }
  }
  throw new Error("The generated site did not pass its production build.");
}

async function runCodexTurn(thread, prompt, job, store) {
  const { events } = await thread.runStreamed(prompt);
  let finalResponse = "";
  for await (const event of events) {
    if (event.type === "item.completed" && event.item?.type === "agent_message") {
      finalResponse = event.item.text || finalResponse;
    }
    if (event.type === "item.completed" && event.item?.type === "command_execution") {
      store.log(job, "info", `Codex command: ${String(event.item.command || "completed").slice(0, 220)}`);
    }
    if (event.type === "turn.failed") {
      throw new Error(event.error?.message || "Codex turn failed.");
    }
  }
  if (finalResponse.trim()) store.log(job, "info", `Codex: ${finalResponse.trim().slice(0, 500)}`);
}

function compactBuildSummary(output) {
  const lines = String(output).trim().split(/\r?\n/).filter(Boolean);
  return `Production build passed. ${lines.slice(-3).join(" ").slice(0, 500)}`;
}
