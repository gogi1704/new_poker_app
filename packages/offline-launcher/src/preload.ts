import { contextBridge, ipcRenderer } from "electron";

export interface LogMessage {
  type: "log";
  text: string;
}

export interface NetworkMessage {
  type: "network";
  status: "online" | "offline";
  pullSuspended: boolean;
}

export interface SyncStatusMessage {
  type: "sync";
  ok: boolean;
  summary: string;
  at: number;
}

contextBridge.exposeInMainWorld("launcher", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  pickRepoFolder: () => ipcRenderer.invoke("pick-repo-folder"),
  dockerStatus: () => ipcRenderer.invoke("docker-status"),
  stackStatus: () => ipcRenderer.invoke("stack-status"),
  getLanIps: () => ipcRenderer.invoke("get-lan-ips"),
  getProxyPort: () => ipcRenderer.invoke("get-proxy-port"),
  openPanel: () => ipcRenderer.invoke("open-panel"),
  runSetup: () => ipcRenderer.invoke("run-setup"),
  runStart: () => ipcRenderer.invoke("run-start"),
  runStop: () => ipcRenderer.invoke("run-stop"),
  smartStart: () => ipcRenderer.invoke("smart-start"),
  cloudListTournaments: (cloudApiUrl: string, cloudAdminPassword: string) =>
    ipcRenderer.invoke("cloud-list-tournaments", cloudApiUrl, cloudAdminPassword),
  selectTrackedTournament: (id: string, name: string) =>
    ipcRenderer.invoke("select-tracked-tournament", id, name),
  syncPullNow: () => ipcRenderer.invoke("sync-pull-now"),
  syncPushNow: () => ipcRenderer.invoke("sync-push-now"),
  checkInternet: () => ipcRenderer.invoke("check-internet"),
  isPullSuspended: () => ipcRenderer.invoke("pull-suspended"),
  resumeAutoPull: () => ipcRenderer.invoke("resume-auto-pull"),
  onLog: (callback: (message: LogMessage) => void) => {
    ipcRenderer.on("log", (_event, message: LogMessage) => callback(message));
  },
  onNetworkStatus: (callback: (message: NetworkMessage) => void) => {
    ipcRenderer.on("network-status", (_event, message: NetworkMessage) => callback(message));
  },
  onSyncStatus: (callback: (message: SyncStatusMessage) => void) => {
    ipcRenderer.on("sync-status", (_event, message: SyncStatusMessage) => callback(message));
  },
});
