const state = {
  token: localStorage.getItem("siteForgeToken") || "",
  activeJobId: null,
  source: null,
};

const elements = {
  form: document.querySelector("#buildForm"),
  prompt: document.querySelector("#prompt"),
  repoName: document.querySelector("#repoName"),
  privateRepository: document.querySelector("#privateRepository"),
  buildButton: document.querySelector("#buildButton"),
  formHint: document.querySelector("#formHint"),
  advancedToggle: document.querySelector("#advancedToggle"),
  advancedPanel: document.querySelector("#advancedPanel"),
  connectionBadge: document.querySelector("#connectionBadge"),
  tokenButton: document.querySelector("#tokenButton"),
  tokenDialog: document.querySelector("#tokenDialog"),
  accessToken: document.querySelector("#accessToken"),
  saveToken: document.querySelector("#saveToken"),
  activeBuild: document.querySelector("#activeBuild"),
  buildTitle: document.querySelector("#buildTitle"),
  buildStatus: document.querySelector("#buildStatus"),
  progressBar: document.querySelector("#progressBar"),
  progressText: document.querySelector("#progressText"),
  stageText: document.querySelector("#stageText"),
  timeline: document.querySelector("#timeline"),
  resultPanel: document.querySelector("#resultPanel"),
  liveLink: document.querySelector("#liveLink"),
  repoLink: document.querySelector("#repoLink"),
  history: document.querySelector("#history"),
  refreshButton: document.querySelector("#refreshButton"),
};

boot();

async function boot() {
  elements.accessToken.value = state.token;
  bindEvents();
  await Promise.all([checkConfig(), loadHistory()]);
}

function bindEvents() {
  elements.advancedToggle.addEventListener("click", () => {
    const open = elements.advancedPanel.hidden;
    elements.advancedPanel.hidden = !open;
    elements.advancedToggle.setAttribute("aria-expanded", String(open));
    elements.advancedToggle.textContent = open ? "Hide advanced" : "Advanced";
  });

  elements.tokenButton.addEventListener("click", () => elements.tokenDialog.showModal());
  elements.saveToken.addEventListener("click", () => {
    state.token = elements.accessToken.value.trim();
    localStorage.setItem("siteForgeToken", state.token);
    setTimeout(() => { checkConfig(); loadHistory(); }, 0);
  });
  elements.refreshButton.addEventListener("click", loadHistory);
  elements.form.addEventListener("submit", createBuild);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

async function checkConfig() {
  try {
    const config = await api("/api/config");
    elements.privateRepository.checked = config.defaults.privateRepository;
    elements.connectionBadge.textContent = config.ready ? "System ready" : "Credentials missing";
    elements.connectionBadge.className = `badge ${config.ready ? "ready" : "warning"}`;
  } catch (error) {
    elements.connectionBadge.textContent = error.message === "Unauthorised" ? "Token required" : "Service unavailable";
    elements.connectionBadge.className = "badge warning";
  }
}

async function createBuild(event) {
  event.preventDefault();
  const prompt = elements.prompt.value.trim();
  if (prompt.length < 12) {
    elements.formHint.textContent = "Add a little more detail before building.";
    elements.prompt.focus();
    return;
  }

  setBuilding(true);
  elements.formHint.textContent = "Creating the job…";
  try {
    const job = await api("/api/builds", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        repoName: elements.repoName.value.trim(),
        privateRepository: elements.privateRepository.checked,
      }),
    });
    elements.formHint.textContent = "Build started. You may leave this tab open to follow progress.";
    renderJob(job);
    connectEvents(job.id);
    await loadHistory();
  } catch (error) {
    elements.formHint.textContent = error.message;
    setBuilding(false);
  }
}

function connectEvents(id) {
  state.activeJobId = id;
  state.source?.close();
  const query = state.token ? `?token=${encodeURIComponent(state.token)}` : "";
  const source = new EventSource(`/api/builds/${id}/events${query}`);
  state.source = source;
  source.addEventListener("snapshot", (event) => renderJob(JSON.parse(event.data)));
  source.addEventListener("update", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.job) renderJob(payload.job);
    if (payload.entry) appendLog(payload.entry);
  });
  source.onerror = async () => {
    source.close();
    try {
      const job = await api(`/api/builds/${id}`);
      renderJob(job);
      if (["queued", "running"].includes(job.status)) setTimeout(() => connectEvents(id), 3000);
    } catch {
      // The manual refresh control remains available if reconnecting fails.
    }
  };
}

function renderJob(job) {
  state.activeJobId = job.id;
  elements.activeBuild.hidden = false;
  elements.buildTitle.textContent = stageTitles[job.stage] || titleCase(job.stage);
  elements.buildStatus.textContent = job.status;
  elements.buildStatus.className = `status-pill ${job.status}`;
  elements.progressBar.style.width = `${job.progress || 0}%`;
  elements.progressText.textContent = `${job.progress || 0}%`;
  elements.stageText.textContent = titleCase(job.stage);
  elements.timeline.replaceChildren(...job.logs.slice(-80).map(logNode));
  elements.timeline.scrollTop = elements.timeline.scrollHeight;

  const completed = job.status === "completed" && job.result;
  elements.resultPanel.hidden = !completed;
  if (completed) {
    elements.liveLink.href = job.result.deployment;
    elements.repoLink.href = job.result.repository;
  }
  if (["completed", "failed"].includes(job.status)) {
    setBuilding(false);
    loadHistory();
  }
}

function appendLog(entry) {
  elements.timeline.append(logNode(entry));
  while (elements.timeline.children.length > 80) elements.timeline.firstElementChild.remove();
  elements.timeline.scrollTop = elements.timeline.scrollHeight;
}

function logNode(entry) {
  const item = document.createElement("li");
  const time = document.createElement("time");
  time.dateTime = entry.at;
  time.textContent = new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const message = document.createElement("span");
  message.className = entry.level || "info";
  message.textContent = entry.message;
  item.append(time, message);
  return item;
}

async function loadHistory() {
  try {
    const builds = await api("/api/builds");
    if (!builds.length) {
      elements.history.innerHTML = '<p class="empty-state">No builds yet.</p>';
      return;
    }
    elements.history.replaceChildren(...builds.slice(0, 12).map(historyNode));
  } catch (error) {
    elements.history.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

function historyNode(job) {
  const card = document.createElement("article");
  card.className = "history-card";
  card.tabIndex = 0;
  const copy = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = job.prompt;
  const meta = document.createElement("p");
  meta.textContent = `${new Date(job.createdAt).toLocaleString()} · ${job.progress}%`;
  copy.append(title, meta);
  const status = document.createElement("span");
  status.className = `status-pill ${job.status}`;
  status.textContent = job.status;
  card.append(copy, status);
  const open = () => {
    renderJob(job);
    if (["queued", "running"].includes(job.status)) connectEvents(job.id);
    elements.activeBuild.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  card.addEventListener("click", open);
  card.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) open(); });
  return card;
}

function setBuilding(building) {
  elements.buildButton.disabled = building;
  elements.buildButton.querySelector("span").textContent = building ? "Building…" : "Forge website";
}

function titleCase(value) {
  return String(value || "").replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeHtml(value) {
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML;
}

const stageTitles = {
  queued: "Waiting for an available worker",
  preparing: "Preparing the workspace",
  generating: "Designing and building",
  refining: "Reviewing the experience",
  installing: "Installing dependencies",
  validating: "Validating production build",
  publishing: "Publishing to GitHub",
  deploying: "Deploying to Vercel",
  completed: "Website published",
  failed: "Build needs attention",
};
