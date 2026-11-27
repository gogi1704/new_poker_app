const repoPathEl = document.getElementById("repo-path");
const dockerPillEl = document.getElementById("docker-pill");
const stackPillEl = document.getElementById("stack-pill");
const lanListEl = document.getElementById("lan-list");
const logEl = document.getElementById("log");

const pickRepoBtn = document.getElementById("pick-repo");
const refreshBtn = document.getElementById("refresh");
const setupBtn = document.getElementById("btn-setup");
const startBtn = document.getElementById("btn-start");
const stopBtn = document.getElementById("btn-stop");
const openBtn = document.getElementById("btn-open");

// ---- single status + action area ---------------------------------------
// One readout, one primary action at a time — the TD should never have to
// combine several pills/buttons to know "is everything OK, what do I press
// next". Priority, highest first: pick a project folder -> Docker must be
// running -> the stack must be started -> (once running) network/sync
// state, same logic as before. Whichever state applies shows exactly the
// button(s) that make sense for it; "Открыть панель"/"Остановить" are
// additionally shown any time the stack is actually running, on top of
// whatever that state's own contextual buttons are.
const statusDotEl = document.getElementById("status-dot");
const statusTitleEl = document.getElementById("status-title");
const statusDetailEl = document.getElementById("status-detail");
const btnPickRepoStatus = document.getElementById("btn-pick-repo");
const btnRecheck = document.getElementById("btn-recheck");
const btnSmartStart = document.getElementById("btn-smart-start");
const btnStatusResume = document.getElementById("btn-status-resume");
const btnStatusPush = document.getElementById("btn-status-push");
const btnStatusOpen = document.getElementById("btn-status-open");
const btnStatusStop = document.getElementById("btn-status-stop");
const statusActionButtons = [
  btnPickRepoStatus,
  btnRecheck,
  btnSmartStart,
  btnStatusResume,
  btnStatusPush,
  btnStatusOpen,
  btnStatusStop,
];

const actionButtons = [pickRepoBtn, setupBtn, startBtn, stopBtn, openBtn, btnSmartStart, btnStatusStop, btnPickRepoStatus];

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

let cloudTournaments = [];

let currentRepoPath = null;
let dockerState = "unknown"; // "unknown" | "not-installed" | "not-running" | "running"
let stackRunning = false;

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

  if (!currentRepoPath) {
    setStatusDot("unknown");
    statusTitleEl.textContent = "📁 Выбери папку проекта";
    statusDetailEl.textContent = "Папка с исходниками new_poker_app (там, где docker-compose.local.yml).";
    btnPickRepoStatus.classList.remove("hidden");
    return;
  }

  if (dockerState !== "running") {
    setStatusDot(dockerState === "not-installed" ? "offline" : "warn");
    statusTitleEl.textContent = dockerState === "not-installed" ? "🔴 Docker не установлен" : "🟡 Docker не запущен";
    statusDetailEl.textContent =
      dockerState === "not-installed"
        ? "Нужен Docker Desktop — без него офлайн-режим не поднять."
        : "Открой Docker Desktop и подожди, пока он запустится, потом нажми «Проверить снова».";
    btnRecheck.classList.remove("hidden");
    return;
  }

  if (!stackRunning) {
    setStatusDot("unknown");
    statusTitleEl.textContent = "⚪ Не запущено";
    statusDetailEl.textContent =
      "Нажми «Запустить» — при первом разе это настроит всё само (может занять несколько минут), в следующий раз будет быстро.";
    btnSmartStart.classList.remove("hidden");
    return;
  }

  // Stack is up from here on — always offer to open the panel / stop it,
  // on top of whichever network/sync message below applies.
  btnStatusOpen.classList.remove("hidden");
  btnStatusStop.classList.remove("hidden");

  if (netStatus === "offline") {
    setStatusDot("offline");
    statusTitleEl.textContent = "🔴 Офлайн";
    statusDetailEl.textContent = "Турнир ведётся локально через единый адрес — ничего больше делать не нужно.";
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

btnPickRepoStatus.addEventListener("click", async () => {
  await window.launcher.pickRepoFolder();
  await refreshAll();
});

btnRecheck.addEventListener("click", refreshAll);

btnSmartStart.addEventListener("click", () => runGuarded(window.launcher.smartStart, "Запуск"));

btnStatusOpen.addEventListener("click", () => window.launcher.openPanel());

btnStatusStop.addEventListener("click", () => runGuarded(window.launcher.runStop, "Остановка"));

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

// ---- diagnostics/advanced card -------------------------------------------

async function refreshRepo() {
  const config = await window.launcher.getConfig();
  currentRepoPath = config.repoPath;
  repoPathEl.textContent = config.repoPath ?? "не выбрана";
  return config.repoPath;
}

async function refreshDocker() {
  dockerState = await window.launcher.dockerStatus();
  if (dockerState === "running") setPill(dockerPillEl, "ok", "работает");
  else if (dockerState === "not-running") setPill(dockerPillEl, "warn", "не запущен");
  else setPill(dockerPillEl, "bad", "не установлен");
}

async function refreshStack() {
  const services = await window.launcher.stackStatus();
  stackRunning = services.length > 0;
  if (services.length === 0) {
    setPill(stackPillEl, "unknown", "остановлен");
    return;
  }
  const healthy = services.filter((s) => /running|healthy/.test(s.state));
  if (healthy.length === services.length) setPill(stackPillEl, "ok", "запущен (" + services.length + ")");
  else setPill(stackPillEl, "warn", healthy.length + "/" + services.length + " готово");
}

async function refreshLan() {
  const [ips, proxyPort] = await Promise.all([window.launcher.getLanIps(), window.launcher.getProxyPort()]);
  const port = proxyPort || 8080;
  lanListEl.innerHTML = "";
  if (ips.length === 0) {
    lanListEl.innerHTML = '<li class="muted">не найдено (проверь Wi-Fi)</li>';
    return;
  }
  for (const ip of ips) {
    const li = document.createElement("li");
    li.textContent = "http://" + ip + ":" + port;
    lanListEl.appendChild(li);
  }
}

async function refreshAll() {
  await Promise.all([refreshRepo(), refreshDocker(), refreshStack(), refreshLan(), refreshSyncPanel()]);
  renderStatus();
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
  await refreshAll();
}

init();
setInterval(async () => {
  await refreshDocker();
  await refreshStack();
  renderStatus();
}, 5000);
