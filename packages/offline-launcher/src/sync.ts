import type { LauncherConfig } from "./config";

// The local stack's web-td nginx always proxies /api/ on this fixed port
// (docker-compose.local.yml) — never configurable, unlike the cloud side.
const LOCAL_API_URL = "http://localhost:8080";

export interface CloudTournamentSummary {
  id: string;
  name: string;
  scheduledAt: string;
  status: string;
}

interface ImportResponse {
  imported: boolean;
  tournamentId: string;
  name: string;
  counts: { players: number; results: number; knockouts: number; rpsLedger: number };
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

// Both API deployments (cloud and local) use the exact same club-wide
// admin-password login — logging in fresh each call is simpler and more
// robust than caching a 24h token across a long-running background loop.
async function login(baseUrl: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/admin-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(`не удалось войти (${await readErrorMessage(res)})`);
  const data = (await res.json()) as { token: string };
  return data.token;
}

export async function listCloudTournaments(baseUrl: string, password: string): Promise<CloudTournamentSummary[]> {
  const token = await login(baseUrl, password);
  const res = await fetch(`${baseUrl}/api/td/tournaments`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`не удалось получить список турниров (${await readErrorMessage(res)})`);
  const rows = (await res.json()) as Array<{ id: string; name: string; scheduledAt: string; status: string }>;
  return rows.map((r) => ({ id: r.id, name: r.name, scheduledAt: r.scheduledAt, status: r.status }));
}

async function exportTournament(baseUrl: string, password: string, tournamentId: string): Promise<unknown> {
  const token = await login(baseUrl, password);
  const res = await fetch(`${baseUrl}/api/td/tournaments/${tournamentId}/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`не удалось выгрузить турнир (${await readErrorMessage(res)})`);
  return res.json();
}

// Keeps updating a destination that's already running/paused — used for
// both sync directions here (cloud -> local background pull, and the
// local -> cloud push-back button), since both need to be able to overwrite
// a tournament that's already underway on the other side, not just one
// still scheduled/registering.
async function mirrorImportTournament(baseUrl: string, password: string, data: unknown): Promise<ImportResponse> {
  const token = await login(baseUrl, password);
  const res = await fetch(`${baseUrl}/api/td/tournaments/mirror-import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`не удалось загрузить турнир (${await readErrorMessage(res)})`);
  return res.json();
}

interface ClubSettings {
  name: string;
  logoUrl: string | null;
  boardSettings: unknown;
}

async function getClubSettings(baseUrl: string, password: string): Promise<ClubSettings> {
  const token = await login(baseUrl, password);
  const res = await fetch(`${baseUrl}/api/td/club`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`не удалось получить настройки клуба (${await readErrorMessage(res)})`);
  return res.json();
}

async function putClubSettings(baseUrl: string, password: string, data: Partial<ClubSettings>): Promise<void> {
  const token = await login(baseUrl, password);
  const res = await fetch(`${baseUrl}/api/td/club`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`не удалось обновить настройки клуба (${await readErrorMessage(res)})`);
}

async function exportPlayerRoster(baseUrl: string, password: string): Promise<unknown> {
  const token = await login(baseUrl, password);
  const res = await fetch(`${baseUrl}/api/td/players/export-roster`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`не удалось выгрузить список игроков (${await readErrorMessage(res)})`);
  return res.json();
}

async function importPlayerRosterRemote(baseUrl: string, password: string, roster: unknown): Promise<{ count: number }> {
  const token = await login(baseUrl, password);
  const res = await fetch(`${baseUrl}/api/td/players/import-roster`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(roster),
  });
  if (!res.ok) throw new Error(`не удалось загрузить список игроков (${await readErrorMessage(res)})`);
  return res.json();
}

export interface SyncOutcome {
  summary: string;
  localTournamentId?: string;
}

// The local deployment has DISABLE_ADMIN_AUTH=true (docker-compose.local.yml)
// and never actually checks whatever password is sent — this just needs to
// be a non-empty string for the request body to make sense.
const LOCAL_PASSWORD = "offline";

// Cloud -> local, club branding/board settings + the FULL player roster
// (every bot user, not just ones registered for the tracked tournament).
// Meant to run silently, repeatedly, while online, independent of whether a
// tournament is tracked yet — unlike pullFromCloud below, this never
// touches anything an offline TD might be mid-tournament on, so it's safe
// to keep running even while that tournament sync is suspended (see
// main.ts's pullSuspended). Mirroring the whole roster is what lets the TD
// find and add an existing bot user by nickname during check-in even
// offline, instead of only ever being able to create a brand-new synthetic
// walk-in identity for them.
export async function pullRosterAndClub(config: LauncherConfig): Promise<SyncOutcome> {
  if (!config.cloudApiUrl || !config.cloudAdminPassword) throw new Error("Облачная синхронизация ещё не настроена");

  const club = await getClubSettings(config.cloudApiUrl, config.cloudAdminPassword);
  await putClubSettings(LOCAL_API_URL, LOCAL_PASSWORD, {
    name: club.name,
    logoUrl: club.logoUrl,
    boardSettings: club.boardSettings,
  });

  const roster = await exportPlayerRoster(config.cloudApiUrl, config.cloudAdminPassword);
  const rosterResult = await importPlayerRosterRemote(LOCAL_API_URL, LOCAL_PASSWORD, roster);

  return { summary: `клуб обновлён, игроков в общем списке: ${rosterResult.count}` };
}

// Cloud -> local, the tracked tournament itself (including its blind-clock
// position) — the tournament import's own "mirror" mode keeps updating it
// through running/paused and only stops once it's actually finished/
// cancelled there (locally or in the cloud).
export async function pullFromCloud(config: LauncherConfig): Promise<SyncOutcome> {
  if (!config.cloudApiUrl || !config.cloudAdminPassword) throw new Error("Облачная синхронизация ещё не настроена");
  if (!config.trackedTournamentId) throw new Error("Не выбран отслеживаемый турнир");

  const data = await exportTournament(config.cloudApiUrl, config.cloudAdminPassword, config.trackedTournamentId);
  const result = await mirrorImportTournament(LOCAL_API_URL, LOCAL_PASSWORD, data);
  const summary = result.imported
    ? `турнир обновлён, игроков в турнире: ${result.counts.players}`
    : "турнир без изменений (уже завершён/отменён локально)";
  return { summary, localTournamentId: result.tournamentId };
}

// Local -> cloud. Button-triggered only (TD confirms) — never run on a
// timer. Uses the same "mirror" import the cloud->local pull uses (not the
// stricter "sync" mode), on purpose: after an outage the cloud's copy of the
// tracked tournament is very likely already "running"/"paused" (that's the
// whole reason it was being mirrored locally in the first place), and the
// point of this button is exactly to overwrite that stale cloud copy with
// what actually happened on the laptop while offline. Only refuses when the
// cloud side is already finished/cancelled — a genuinely closed-out event
// that must never be resurrected or corrupted by a late push. Club settings
// aren't pushed back — cloud stays the one source of truth for
// branding/board, never edited locally.
export async function pushToCloud(config: LauncherConfig): Promise<SyncOutcome> {
  if (!config.cloudApiUrl || !config.cloudAdminPassword) throw new Error("Облачная синхронизация ещё не настроена");
  if (!config.localTournamentId) throw new Error("Ещё не было ни одной синхронизации из облака — нечего выгружать");

  const data = await exportTournament(LOCAL_API_URL, LOCAL_PASSWORD, config.localTournamentId);
  const result = await mirrorImportTournament(config.cloudApiUrl, config.cloudAdminPassword, data);
  const summary = result.imported
    ? `перенесено в облако — результатов: ${result.counts.results}, нокаутов: ${result.counts.knockouts}`
    : "не перенесено — в облаке турнир уже завершён/отменён";
  return { summary };
}
