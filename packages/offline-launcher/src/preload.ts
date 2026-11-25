import { contextBridge, ipcRenderer } from "electron";

export interface LogMessage {
  type: "log";
  text: string;
}

export interface NetworkMessage {
  type: "network";
  status: "online" | "offline";
}

contextBridge.exposeInMainWorld("launcher", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  pickRepoFolder: () => ipcRenderer.invoke("pick-repo-folder"),
  dockerStatus: () => ipcRenderer.invoke("docker-status"),
  stackStatus: () => ipcRenderer.invoke("stack-status"),
  getLanIps: () => ipcRenderer.invoke("get-lan-ips"),
  openPanel: () => ipcRenderer.invoke("open-panel"),
  runSetup: (adminPassword?: string) => ipcRenderer.invoke("run-setup", adminPassword),
  runStart: () => ipcRenderer.invoke("run-start"),
  runStop: () => ipcRenderer.invoke("run-stop"),
  onLog: (callback: (message: LogMessage) => void) => {
    ipcRenderer.on("log", (_event, message: LogMessage) => callback(message));
  },
  onNetworkStatus: (callback: (message: NetworkMessage) => void) => {
    ipcRenderer.on("network-status", (_event, message: NetworkMessage) => callback(message));
  },
});
