import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { loadConfig, looksLikeRepo, saveConfig } from "./config";
import { checkDockerStatus, composeStatus, runCommand, streamTo } from "./docker";
import { startNetworkWatcher } from "./network";
import { runSetup } from "./setup";

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

app.whenReady().then(() => {
  createWindow();
  startNetworkWatcher((status) => {
    win?.webContents.send("network-status", { type: "network", status });
  });
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
