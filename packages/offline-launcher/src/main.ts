import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { loadConfig, looksLikeRepo, saveConfig } from "./config";
import { checkDockerStatus, composeStatus, runCommand, streamTo } from "./docker";
import { checkInternet, startNetworkWatcher } from "./network";
import { runSetup } from "./setup";
import { listCloudTournaments, pullFromCloud, pushToCloud } from "./sync";

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

// Fires on a plain timer rather than off the network-watcher's transition
// events, so it doesn't depend on that watcher's state — it just checks
// connectivity itself right before trying. Silently skipped (no log spam)
// whenever sync isn't configured yet or a push/pull is already in flight.
function startAutoPull(): void {
  setInterval(async () => {
    if (syncBusy) return;
    const config = loadConfig();
    if (!config.cloudApiUrl || !config.cloudAdminPassword || !config.trackedTournamentId) return;
    if (!(await checkInternet())) return;
    syncBusy = true;
    try {
      const result = await pullFromCloud(config);
      if (result.localTournamentId) saveConfig({ localTournamentId: result.localTournamentId });
      win?.webContents.send("log", { type: "log", text: `\n[синхронизация] ${result.summary}\n` });
    } catch (err) {
      win?.webContents.send("log", {
        type: "log",
        text: `\n[синхронизация] ошибка: ${err instanceof Error ? err.message : String(err)}\n`,
      });
    } finally {
      syncBusy = false;
    }
  }, PULL_INTERVAL_MS);
}

app.whenReady().then(() => {
  createWindow();
  startNetworkWatcher((status) => {
    win?.webContents.send("network-status", { type: "network", status });
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

ipcMain.handle("run-setup", (_event, adminPassword?: string) =>
  withBusyGuard(async () => {
    const repoPath = requireRepoPath();
    if (!win) return;
    await runSetup(repoPath, streamTo(win, "log"), adminPassword || undefined);
    // Also remembered for cloud<->local sync (sync.ts), which needs to log
    // into this same local panel on its own, in the background.
    if (adminPassword) saveConfig({ localAdminPassword: adminPassword });
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

ipcMain.handle("set-local-password", (_event, localAdminPassword: string) => saveConfig({ localAdminPassword }));

ipcMain.handle("select-tracked-tournament", (_event, id: string, name: string) =>
  // Resets localTournamentId: switching the tracked tournament means the
  // next pull should treat it as a fresh one, not push-target the
  // previously tracked tournament's local copy.
  saveConfig({ trackedTournamentId: id, trackedTournamentName: name, localTournamentId: null }),
);

// Separate from withBusyGuard's `busy` (docker setup/start/stop) — a sync
// call is quick and unrelated to those, but must still never overlap the
// background auto-pull timer or another manual sync call.
async function withSyncGuard(action: () => Promise<string>): Promise<{ ok: boolean; reason?: string }> {
  if (syncBusy) return { ok: false, reason: "Синхронизация уже выполняется" };
  syncBusy = true;
  try {
    const summary = await action();
    win?.webContents.send("log", { type: "log", text: `\n[синхронизация] ${summary}\n` });
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    win?.webContents.send("log", { type: "log", text: `\n[синхронизация] ошибка: ${reason}\n` });
    return { ok: false, reason };
  } finally {
    syncBusy = false;
  }
}

ipcMain.handle("sync-pull-now", () =>
  withSyncGuard(async () => {
    const result = await pullFromCloud(loadConfig());
    if (result.localTournamentId) saveConfig({ localTournamentId: result.localTournamentId });
    return result.summary;
  }),
);

ipcMain.handle("sync-push-now", () =>
  withSyncGuard(async () => {
    const result = await pushToCloud(loadConfig());
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
