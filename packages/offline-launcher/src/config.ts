import { app } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface LauncherConfig {
  repoPath: string | null;
  // Direct cloud<->local sync (see sync.ts) — no manual export/import files.
  cloudApiUrl: string | null;
  cloudAdminPassword: string | null;
  localAdminPassword: string | null;
  trackedTournamentId: string | null;
  trackedTournamentName: string | null;
  // The matching tournament's id on the LOCAL side, filled in after the
  // first successful pull — local/cloud are separate databases with
  // independent ids, so this is what lets a later push-back know which
  // local tournament to export.
  localTournamentId: string | null;
}

const DEFAULT_CONFIG: LauncherConfig = {
  repoPath: null,
  cloudApiUrl: null,
  cloudAdminPassword: null,
  localAdminPassword: null,
  trackedTournamentId: null,
  trackedTournamentName: null,
  localTournamentId: null,
};

function configPath(): string {
  return join(app.getPath("userData"), "config.json");
}

export function loadConfig(): LauncherConfig {
  const path = configPath();
  if (!existsSync(path)) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(path, "utf-8")) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// Merges onto the existing stored config instead of replacing it wholesale
// — callers pass only the fields they're changing, so saving e.g. just
// repoPath doesn't wipe out the cloud-sync settings saved earlier.
export function saveConfig(patch: Partial<LauncherConfig>): LauncherConfig {
  const merged = { ...loadConfig(), ...patch };
  writeFileSync(configPath(), JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

// A repo folder is valid if it's the actual project root — checked by the
// one file every mode of this app needs (the offline compose file), not by
// name/location, since the user picks the folder themselves.
export function looksLikeRepo(path: string): boolean {
  return existsSync(join(path, "docker-compose.local.yml"));
}
