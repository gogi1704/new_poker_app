import { app } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface LauncherConfig {
  repoPath: string | null;
}

function configPath(): string {
  return join(app.getPath("userData"), "config.json");
}

export function loadConfig(): LauncherConfig {
  const path = configPath();
  if (!existsSync(path)) return { repoPath: null };
  try {
    return { repoPath: null, ...JSON.parse(readFileSync(path, "utf-8")) };
  } catch {
    return { repoPath: null };
  }
}

export function saveConfig(config: LauncherConfig): void {
  writeFileSync(configPath(), JSON.stringify(config, null, 2), "utf-8");
}

// A repo folder is valid if it's the actual project root — checked by the
// one file every mode of this app needs (the offline compose file), not by
// name/location, since the user picks the folder themselves.
export function looksLikeRepo(path: string): boolean {
  return existsSync(join(path, "docker-compose.local.yml"));
}
