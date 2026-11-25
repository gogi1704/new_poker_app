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
const localPasswordEl = document.getElementById("local-password");
const connectBtn = document.getElementById("btn-cloud-connect");
const trackedSelectEl = document.getElementById("tracked-tournament");
const syncStatusEl = document.getElementById("sync-status");
const syncPullBtn = document.getElementById("btn-sync-pull");
const syncPushBtn = document.getElementById("btn-sync-push");

let cloudTournaments = [];

function describeSyncStatus(config) {
  if (!config.cloudApiUrl || !config.cloudAdminPassword) return "не настроено";
  if (!config.trackedTournamentId) return "подключено, турнир не выбран";
  return "отслеживается: " + (config.trackedTournamentName ?? config.trackedTournamentId);
}

async function refreshSyncPanel() {
  const config = await window.launcher.getConfig();
  if (config.cloudApiUrl) cloudUrlEl.value = config.cloudApiUrl;
  syncStatusEl.textContent = describeSyncStatus(config);
  if (config.trackedTournamentId && ![...trackedSelectEl.options].some((o) => o.value === config.trackedTournamentId)) {
    const opt = document.createElement("option");
    opt.value = config.trackedTournamentId;
    opt.textContent = config.trackedTournamentName ?? config.trackedTournamentId;
    trackedSelectEl.appendChild(opt);
  }
  if (config.trackedTournamentId) trackedSelectEl.value = config.trackedTournamentId;
}

connectBtn.addEventListener("click", async () => {
  if (localPasswordEl.value.trim()) await window.launcher.setLocalPassword(localPasswordEl.value.trim());
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
syncPushBtn.addEventListener("click", () => runGuarded(window.launcher.syncPushNow, "Выгрузка в облако"));

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

async function refreshAll() {
  await Promise.all([refreshRepo(), refreshDocker(), refreshStack(), refreshLan(), refreshSyncPanel()]);
}

window.launcher.onLog((message) => {
  if (message.type === "log") appendLog(message.text);
});

const networkBannerEl = document.getElementById("network-banner");
const networkBannerTextEl = document.getElementById("network-banner-text");
const networkBannerActionBtn = document.getElementById("network-banner-action");
const networkBannerDismissBtn = document.getElementById("network-banner-dismiss");

function showNetworkBanner(status) {
  networkBannerEl.classList.remove("banner-offline", "banner-online", "hidden");
  if (status === "offline") {
    networkBannerEl.classList.add("banner-offline");
    networkBannerTextEl.textContent = "⚠ Сеть пропала. Веди турнир в локальной (оффлайн) панели.";
    networkBannerActionBtn.textContent = "Открыть панель";
    networkBannerActionBtn.onclick = () => window.launcher.openPanel();
  } else {
    networkBannerEl.classList.add("banner-online");
    networkBannerTextEl.textContent = "✅ Сеть восстановлена. Выгрузить турнир в облако?";
    networkBannerActionBtn.textContent = "Синхронизировать в облако";
    networkBannerActionBtn.onclick = () =>
      runGuarded(window.launcher.syncPushNow, "Выгрузка в облако").then(() =>
        networkBannerEl.classList.add("hidden"),
      );
  }
}

networkBannerDismissBtn.addEventListener("click", () => {
  networkBannerEl.classList.add("hidden");
});

window.launcher.onNetworkStatus((message) => {
  if (message.type === "network") showNetworkBanner(message.status);
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

const adminPasswordEl = document.getElementById("admin-password");

setupBtn.addEventListener("click", () =>
  runGuarded(() => window.launcher.runSetup(adminPasswordEl.value.trim()), "Настройка"),
);
startBtn.addEventListener("click", () => runGuarded(window.launcher.runStart, "Запуск"));
stopBtn.addEventListener("click", () => runGuarded(window.launcher.runStop, "Остановка"));

refreshAll();
setInterval(() => {
  refreshDocker();
  refreshStack();
}, 5000);
