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
  await Promise.all([refreshRepo(), refreshDocker(), refreshStack(), refreshLan()]);
}

window.launcher.onLog((message) => {
  if (message.type === "log") appendLog(message.text);
});

const networkBannerEl = document.getElementById("network-banner");
const networkBannerTextEl = document.getElementById("network-banner-text");
const networkBannerOpenBtn = document.getElementById("network-banner-open");
const networkBannerDismissBtn = document.getElementById("network-banner-dismiss");

function showNetworkBanner(status) {
  networkBannerEl.classList.remove("banner-offline", "banner-online", "hidden");
  if (status === "offline") {
    networkBannerEl.classList.add("banner-offline");
    networkBannerTextEl.textContent =
      "⚠ Сеть пропала. Веди турнир в локальной (оффлайн) панели — данные перенесёшь в облако, когда сеть вернётся.";
  } else {
    networkBannerEl.classList.add("banner-online");
    networkBannerTextEl.textContent =
      "✅ Сеть восстановлена. Когда турнир закончится — скачай экспорт в локальной панели и отправь файл боту, чтобы перенести результаты в облако.";
  }
}

networkBannerDismissBtn.addEventListener("click", () => {
  networkBannerEl.classList.add("hidden");
});
networkBannerOpenBtn.addEventListener("click", () => window.launcher.openPanel());

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
