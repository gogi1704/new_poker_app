const repoPathEl = document.getElementById("repo-path");
const dockerPillEl = document.getElementById("docker-pill");
const stackPillEl = document.getElementById("stack-pill");
const lanListEl = document.getElementById("lan-list");
const logEl = document.getElementById("log");
const setupDetailsEl = document.getElementById("setup-details");

const pickRepoBtn = document.getElementById("pick-repo");
const refreshBtn = document.getElementById("refresh");
const setupBtn = document.getElementById("btn-setup");
const startBtn = document.getElementById("btn-start");
const stopBtn = document.getElementById("btn-stop");
const openBtn = document.getElementById("btn-open");

const actionButtons = [pickRepoBtn, setupBtn, startBtn, stopBtn, openBtn];

function setPill(el, state, text) {
  el.className = "pill pill-" + state;
  el.textContent = text;
}

function appendLog(text) {
  logEl.textContent += text;
  logEl.scrollTop = logEl.scrollHeight;
}

function setBusy(busy) {
  for (const btn of actionButtons) btn.disabled = busy;
}

const cloudUrlEl = document.getElementById("cloud-url");
const cloudPasswordEl = document.getElementById("cloud-password");
const connectBtn = document.getElementById("btn-cloud-connect");
const trackedSelectEl = document.getElementById("tracked-tournament");
const syncPullBtn = document.getElementById("btn-sync-pull");
const syncPushBtn = document.getElementById("btn-sync-push");

let cloudTournaments = [];

// ---- persistent status bar -------------------------------------------
// Always-visible state (not a transient dismissible banner): is there a
// route to the internet right now, is the automatic cloud pull paused
// because we just came back from an offline stretch, and when did sync
// last actually run. Driven by three sources: an explicit check on load
// (the watcher only reports *changes*), the network-status IPC event, and
// the sync-status IPC event.
const statusDotEl = document.getElementById("status-dot");
const statusTitleEl = document.getElementById("status-title");
const statusDetailEl = document.getElementById("status-detail");
const btnStatusResume = document.getElementById("btn-status-resume");
const btnStatusPush = document.getElementById("btn-status-push");
const btnStatusOpen = document.getElementById("btn-status-open");
const statusActionButtons = [btnStatusResume, btnStatusPush, btnStatusOpen];

let netStatus = null; // "online" | "offline" | null (not checked yet)
let pullSuspended = false;
let lastSync = null; // { at, ok, summary }
let syncConfigured = false;
let trackedName = null;

function formatAgo(atMs) {
  const diffSec = Math.max(0, Math.round((Date.now() - atMs) / 1000));
  if (diffSec < 10) return "только что";
  if (diffSec < 60) return diffSec + " сек назад";
  const min = Math.round(diffSec / 60);
  if (min < 60) return min + " мин назад";
  return Math.round(min / 60) + " ч назад";
}

function setStatusDot(state) {
  statusDotEl.className = "status-dot status-dot-" + state;
}

function renderStatus() {
  for (const btn of statusActionButtons) btn.classList.add("hidden");

  if (netStatus === "offline") {
    setStatusDot("offline");
    statusTitleEl.textContent = "🔴 Офлайн";
    statusDetailEl.textContent = "Турнир ведётся локально. Открой локальную панель, если ещё не открыта.";
    btnStatusOpen.classList.remove("hidden");
    return;
  }

  if (netStatus === "online" && pullSuspended) {
    setStatusDot("warn");
    statusTitleEl.textContent = "🟡 Сеть восстановлена";
    statusDetailEl.textContent =
      "Автосинхронизация на паузе, чтобы не затереть то, что происходило локально пока сети не было. Выгрузи результаты в облако.";
    btnStatusPush.classList.remove("hidden");
    btnStatusResume.classList.remove("hidden");
    return;
  }

  if (netStatus === null) {
    setStatusDot("unknown");
    statusTitleEl.textContent = "Проверяю сеть…";
    statusDetailEl.textContent = "—";
    return;
  }

  if (!syncConfigured) {
    setStatusDot("ok");
    statusTitleEl.textContent = "🟢 Онлайн";
    statusDetailEl.textContent = "Облачная синхронизация не настроена — заполни блок ниже.";
    return;
  }

  if (!lastSync) {
    setStatusDot("ok");
    statusTitleEl.textContent = "🟢 Онлайн";
    statusDetailEl.textContent = `Турнир «${trackedName}» — автосинхронизация включена, ждёт первого запуска.`;
    return;
  }

  if (!lastSync.ok) {
    setStatusDot("warn");
    statusTitleEl.textContent = "🟢 Онлайн";
    statusDetailEl.textContent = `Ошибка синхронизации (${formatAgo(lastSync.at)}): ${lastSync.summary}`;
    return;
  }

  setStatusDot("ok");
  statusTitleEl.textContent = "🟢 Онлайн";
  statusDetailEl.textContent = `Турнир «${trackedName}» — синхронизировано ${formatAgo(lastSync.at)}`;
}

btnStatusOpen.addEventListener("click", () => window.launcher.openPanel());

btnStatusResume.addEventListener("click", async () => {
  await window.launcher.resumeAutoPull();
  pullSuspended = false;
  renderStatus();
});

btnStatusPush.addEventListener("click", async () => {
  await runGuarded(window.launcher.syncPushNow, "Выгрузка в облако");
  pullSuspended = false;
  renderStatus();
});

window.launcher.onNetworkStatus((message) => {
  netStatus = message.status;
  pullSuspended = message.pullSuspended;
  renderStatus();
});

window.launcher.onSyncStatus((message) => {
  lastSync = { at: message.at, ok: message.ok, summary: message.summary };
  renderStatus();
});

// ---- cloud-sync config card --------------------------------------------

async function refreshSyncPanel() {
  const config = await window.launcher.getConfig();
  if (config.cloudApiUrl) cloudUrlEl.value = config.cloudApiUrl;
  syncConfigured = Boolean(config.cloudApiUrl && config.cloudAdminPassword && config.trackedTournamentId);
  trackedName = config.trackedTournamentName ?? config.trackedTournamentId;
  if (config.trackedTournamentId && ![...trackedSelectEl.options].some((o) => o.value === config.trackedTournamentId)) {
    const opt = document.createElement("option");
    opt.value = config.trackedTournamentId;
    opt.textContent = config.trackedTournamentName ?? config.trackedTournamentId;
    trackedSelectEl.appendChild(opt);
  }
  if (config.trackedTournamentId) trackedSelectEl.value = config.trackedTournamentId;
  renderStatus();
}

connectBtn.addEventListener("click", async () => {
  const result = await window.launcher.cloudListTournaments(cloudUrlEl.value.trim(), cloudPasswordEl.value.trim());
  if (!result.ok) {
    appendLog("\n[синхронизация] Ошибка подключения: " + (result.reason ?? "неизвестная") + "\n");
    return;
  }
  cloudTournaments = result.tournaments;
  trackedSelectEl.innerHTML = '<option value="">—</option>';
  for (const t of cloudTournaments) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name + " — " + t.status + " — " + new Date(t.scheduledAt).toLocaleString("ru-RU");
    trackedSelectEl.appendChild(opt);
  }
  await refreshSyncPanel();
  appendLog("\n[синхронизация] Подключено, турниров в облаке: " + cloudTournaments.length + "\n");
});

trackedSelectEl.addEventListener("change", async () => {
  if (!trackedSelectEl.value) return;
  const t = cloudTournaments.find((x) => x.id === trackedSelectEl.value);
  await window.launcher.selectTrackedTournament(trackedSelectEl.value, t ? t.name : trackedSelectEl.value);
  await refreshSyncPanel();
});

syncPullBtn.addEventListener("click", () => runGuarded(window.launcher.syncPullNow, "Синхронизация из облака"));
syncPushBtn.addEventListener("click", async () => {
  await runGuarded(window.launcher.syncPushNow, "Выгрузка в облако");
  pullSuspended = false;
  renderStatus();
});

// ---- setup/status card --------------------------------------------------

async function refreshRepo() {
  const config = await window.launcher.getConfig();
  repoPathEl.textContent = config.repoPath ?? "не выбрана";
  return config.repoPath;
}

async function refreshDocker() {
  const status = await window.launcher.dockerStatus();
  if (status === "running") setPill(dockerPillEl, "ok", "работает");
  else if (status === "not-running") setPill(dockerPillEl, "warn", "не запущен");
  else setPill(dockerPillEl, "bad", "не установлен");
}

async function refreshStack() {
  const services = await window.launcher.stackStatus();
  if (services.length === 0) {
    setPill(stackPillEl, "unknown", "остановлен");
    return;
  }
  const healthy = services.filter((s) => /running|healthy/.test(s.state));
  if (healthy.length === services.length) setPill(stackPillEl, "ok", "запущен (" + services.length + ")");
  else setPill(stackPillEl, "warn", healthy.length + "/" + services.length + " готово");
}

async function refreshLan() {
  const ips = await window.launcher.getLanIps();
  lanListEl.innerHTML = "";
  if (ips.length === 0) {
    lanListEl.innerHTML = '<li class="muted">не найдено (проверь Wi-Fi)</li>';
    return;
  }
  for (const ip of ips) {
    const li = document.createElement("li");
    li.textContent = "http://" + ip + ":8080";
    lanListEl.appendChild(li);
  }
}

let disclosureInitialized = false;

async function refreshAll() {
  const [repoPath] = await Promise.all([refreshRepo(), refreshDocker(), refreshStack(), refreshLan(), refreshSyncPanel()]);
  if (!disclosureInitialized) {
    disclosureInitialized = true;
    setupDetailsEl.open = !repoPath;
  }
}

window.launcher.onLog((message) => {
  if (message.type === "log") appendLog(message.text);
});

pickRepoBtn.addEventListener("click", async () => {
  await window.launcher.pickRepoFolder();
  await refreshAll();
});

refreshBtn.addEventListener("click", refreshAll);

openBtn.addEventListener("click", () => window.launcher.openPanel());

async function runGuarded(action, label) {
  setBusy(true);
  appendLog("\n=== " + label + " ===\n");
  const result = await action();
  if (!result.ok) appendLog("\n[launcher] Ошибка: " + (result.reason ?? "неизвестная") + "\n");
  setBusy(false);
  await refreshAll();
}

setupBtn.addEventListener("click", () => runGuarded(window.launcher.runSetup, "Настройка"));
startBtn.addEventListener("click", () => runGuarded(window.launcher.runStart, "Запуск"));
stopBtn.addEventListener("click", () => runGuarded(window.launcher.runStop, "Остановка"));

async function init() {
  netStatus = (await window.launcher.checkInternet()) ? "online" : "offline";
  pullSuspended = await window.launcher.isPullSuspended();
  renderStatus();
  await refreshAll();
}

init();
setInterval(() => {
  refreshDocker();
  refreshStack();
  renderStatus();
}, 5000);
