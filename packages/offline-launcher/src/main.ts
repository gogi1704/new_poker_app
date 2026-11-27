import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { loadConfig, looksLikeRepo, saveConfig } from "./config";
import { checkDockerStatus, composeStatus, runCommand, streamTo } from "./docker";
import { checkInternet, startNetworkWatcher } from "./network";
import { runSetup } from "./setup";
import { listCloudTournaments, pullFromCloud, pullRosterAndClub, pushToCloud } from "./sync";

let win: BrowserWindow | null = null;
let busy = false;

function requireRepoPath(): string {
  const { repoPath } = loadConfig();
  if (!repoPath) throw new Error("Папка проекта ещё не выбрана");
  return repoPath;
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 860,
    height: 720,
    minWidth: 700,
    minHeight: 560,
    title: "Don-Poker Offline",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(join(__dirname, "..", "renderer", "index.html"));
}

const PULL_INTERVAL_MS = 60000;
let syncBusy = false;

// Set once we go offline while a tournament is tracked, and only cleared by
// an explicit TD action (push to cloud, or an explicit "nothing changed,
// resume" dismissal) — never automatically on reconnect. Without this, the
// very next 60s timer tick after the network comes back would silently pull
// the cloud's (now stale) copy of the tournament and overwrite whatever the
// TD actually did locally while offline — exactly the moment this sync
// exists to protect, not endanger.
let pullSuspended = false;

function sendSyncStatus(outcome: { ok: boolean; summary: string }): void {
  win?.webContents.send("sync-status", { type: "sync", ...outcome, at: Date.now() });
}

// Fires on a plain timer rather than off the network-watcher's transition
// events, so it doesn't depend on that watcher's state — it just checks
// connectivity itself right before trying. Silently skipped (no log spam)
// whenever sync isn't configured yet or a push/pull is already in flight.
// Two independent steps every tick:
//  1. Club settings + full player roster — always safe, runs as soon as
//     cloud credentials are connected, even with no tournament tracked yet
//     and even while tournament auto-pull is suspended (step 2 below).
//  2. The tracked tournament itself — the dangerous direction, so it's
//     skipped entirely while pullSuspended (an offline period happened and
//     the TD hasn't yet said what to do about it).
function startAutoPull(): void {
  setInterval(async () => {
    if (syncBusy) return;
    const config = loadConfig();
    if (!config.cloudApiUrl || !config.cloudAdminPassword) return;
    if (!(await checkInternet())) return;
    syncBusy = true;

    try {
      const rosterResult = await pullRosterAndClub(config);
      win?.webContents.send("log", { type: "log", text: `\n[синхронизация] ${rosterResult.summary}\n` });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      win?.webContents.send("log", { type: "log", text: `\n[синхронизация] ошибка (клуб/игроки): ${reason}\n` });
    }

    if (!pullSuspended && config.trackedTournamentId) {
      try {
        const result = await pullFromCloud(config);
        if (result.localTournamentId) saveConfig({ localTournamentId: result.localTournamentId });
        win?.webContents.send("log", { type: "log", text: `\n[синхронизация] ${result.summary}\n` });
        sendSyncStatus({ ok: true, summary: result.summary });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        win?.webContents.send("log", { type: "log", text: `\n[синхронизация] ошибка: ${reason}\n` });
        sendSyncStatus({ ok: false, summary: reason });
      }
    }

    syncBusy = false;
  }, PULL_INTERVAL_MS);
}

app.whenReady().then(() => {
  createWindow();
  startNetworkWatcher((status) => {
    if (status === "offline" && loadConfig().trackedTournamentId) pullSuspended = true;
    win?.webContents.send("network-status", { type: "network", status, pullSuspended });
  });
  startAutoPull();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("get-config", () => loadConfig());

// The network watcher only announces a *change* (and stays silent on its
// very first check if already online — see network.ts) — the renderer
// needs this on load too, to show a real status instead of "checking…"
// forever whenever the app happens to start already online.
ipcMain.handle("check-internet", () => checkInternet());

ipcMain.handle("pull-suspended", () => pullSuspended);

ipcMain.handle("resume-auto-pull", () => {
  pullSuspended = false;
  win?.webContents.send("log", { type: "log", text: "\n[синхронизация] Автосинхронизация возобновлена.\n" });
  return { ok: true };
});

ipcMain.handle("pick-repo-folder", async () => {
  if (!win) return loadConfig();
  const result = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  if (result.canceled || !result.filePaths[0]) return loadConfig();
  const picked = result.filePaths[0];
  if (!looksLikeRepo(picked)) {
    dialog.showErrorBox(
      "Не та папка",
      "В выбранной папке нет docker-compose.local.yml — это не папка проекта new_poker_app.",
    );
    return loadConfig();
  }
  const config = { repoPath: picked };
  saveConfig(config);
  return config;
});

ipcMain.handle("docker-status", () => checkDockerStatus());

ipcMain.handle("stack-status", async () => {
  const { repoPath } = loadConfig();
  if (!repoPath) return [];
  return composeStatus(repoPath);
});

ipcMain.handle("get-lan-ips", () => {
  const nets = networkInterfaces();
  const addresses: string[] = [];
  for (const iface of Object.values(nets)) {
    for (const net of iface ?? []) {
      if (net.family === "IPv4" && !net.internal) addresses.push(net.address);
    }
  }
  return addresses;
});

ipcMain.handle("open-panel", () => shell.openExternal("http://localhost:8080"));

// Setup/start/stop all funnel through one guard so two long-running compose
// commands never run concurrently against the same stack.
async function withBusyGuard(action: () => Promise<void>): Promise<{ ok: boolean; reason?: string }> {
  if (busy) return { ok: false, reason: "Уже выполняется другая операция" };
  busy = true;
  try {
    await action();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    busy = false;
  }
}

ipcMain.handle("run-setup", () =>
  withBusyGuard(async () => {
    const repoPath = requireRepoPath();
    if (!win) return;
    await runSetup(repoPath, streamTo(win, "log"));
  }),
);

ipcMain.handle("run-start", () =>
  withBusyGuard(async () => {
    const repoPath = requireRepoPath();
    if (!win) return;
    await runCommand(
      "docker",
      ["compose", "-f", "docker-compose.local.yml", "up", "-d"],
      { cwd: repoPath },
      streamTo(win, "log"),
    );
  }),
);

ipcMain.handle(
  "cloud-list-tournaments",
  async (_event, cloudApiUrl: string, cloudAdminPassword: string): Promise<{ ok: boolean; reason?: string; tournaments?: Awaited<ReturnType<typeof listCloudTournaments>> }> => {
    try {
      const tournaments = await listCloudTournaments(cloudApiUrl, cloudAdminPassword);
      // Only remembered once login+list actually succeeds — never save
      // unverified credentials.
      saveConfig({ cloudApiUrl, cloudAdminPassword });
      return { ok: true, tournaments };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  },
);

ipcMain.handle("select-tracked-tournament", (_event, id: string, name: string) => {
  // Resets localTournamentId: switching the tracked tournament means the
  // next pull should treat it as a fresh one, not push-target the
  // previously tracked tournament's local copy. Also lifts any suspension
  // left over from the previous tournament — nothing to protect for a
  // brand-new selection.
  pullSuspended = false;
  return saveConfig({ trackedTournamentId: id, trackedTournamentName: name, localTournamentId: null });
});

// Separate from withBusyGuard's `busy` (docker setup/start/stop) — a sync
// call is quick and unrelated to those, but must still never overlap the
// background auto-pull timer or another manual sync call.
async function withSyncGuard(action: () => Promise<string>): Promise<{ ok: boolean; reason?: string }> {
  if (syncBusy) return { ok: false, reason: "Синхронизация уже выполняется" };
  syncBusy = true;
  try {
    const summary = await action();
    win?.webContents.send("log", { type: "log", text: `\n[синхронизация] ${summary}\n` });
    sendSyncStatus({ ok: true, summary });
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    win?.webContents.send("log", { type: "log", text: `\n[синхронизация] ошибка: ${reason}\n` });
    sendSyncStatus({ ok: false, summary: reason });
    return { ok: false, reason };
  } finally {
    syncBusy = false;
  }
}

ipcMain.handle("sync-pull-now", () =>
  withSyncGuard(async () => {
    const config = loadConfig();
    const rosterResult = await pullRosterAndClub(config);
    const result = await pullFromCloud(config);
    if (result.localTournamentId) saveConfig({ localTournamentId: result.localTournamentId });
    return `${rosterResult.summary}; ${result.summary}`;
  }),
);

ipcMain.handle("sync-push-now", () =>
  withSyncGuard(async () => {
    const result = await pushToCloud(loadConfig());
    // Cloud now matches (or was already ahead of) local — safe to let the
    // automatic timer resume.
    pullSuspended = false;
    return result.summary;
  }),
);

ipcMain.handle("run-stop", () =>
  withBusyGuard(async () => {
    const repoPath = requireRepoPath();
    if (!win) return;
    await runCommand(
      "docker",
      ["compose", "-f", "docker-compose.local.yml", "stop"],
      { cwd: repoPath },
      streamTo(win, "log"),
    );
  }),
);
