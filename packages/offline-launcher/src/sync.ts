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

async function importTournament(baseUrl: string, password: string, data: unknown): Promise<ImportResponse> {
  const token = await login(baseUrl, password);
  const res = await fetch(`${baseUrl}/api/td/tournaments/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`не удалось загрузить турнир (${await readErrorMessage(res)})`);
  return res.json();
}

export interface SyncOutcome {
  summary: string;
  localTournamentId?: string;
}

// Cloud -> local. Meant to run silently, repeatedly, while online — the
// destination's own import logic (mode "sync") already refuses to touch a
// local tournament that's past "scheduled"/"registering", so once the TD
// actually starts running it (online or, after going offline, locally)
// further automatic pulls stop mutating it on their own.
export async function pullFromCloud(config: LauncherConfig): Promise<SyncOutcome> {
  if (!config.cloudApiUrl || !config.cloudAdminPassword) throw new Error("Облачная синхронизация ещё не настроена");
  if (!config.trackedTournamentId) throw new Error("Не выбран отслеживаемый турнир");
  if (!config.localAdminPassword) throw new Error("Не задан локальный пароль панели");

  const data = await exportTournament(config.cloudApiUrl, config.cloudAdminPassword, config.trackedTournamentId);
  const result = await importTournament(LOCAL_API_URL, config.localAdminPassword, data);
  const summary = result.imported
    ? `обновлено, игроков: ${result.counts.players}`
    : "без изменений (турнир уже идёт/завершён локально)";
  return { summary, localTournamentId: result.tournamentId };
}

// Local -> cloud. Button-triggered only (TD confirms) — never run on a
// timer, since this is the direction that actually overwrites the cloud's
// copy of the tournament.
export async function pushToCloud(config: LauncherConfig): Promise<SyncOutcome> {
  if (!config.cloudApiUrl || !config.cloudAdminPassword) throw new Error("Облачная синхронизация ещё не настроена");
  if (!config.localAdminPassword) throw new Error("Не задан локальный пароль панели");
  if (!config.localTournamentId) throw new Error("Ещё не было ни одной синхронизации из облака — нечего выгружать");

  const data = await exportTournament(LOCAL_API_URL, config.localAdminPassword, config.localTournamentId);
  const result = await importTournament(config.cloudApiUrl, config.cloudAdminPassword, data);
  const summary = result.imported
    ? `перенесено в облако — результатов: ${result.counts.results}, нокаутов: ${result.counts.knockouts}`
    : "не перенесено — в облаке турнир уже идёт/завершён";
  return { summary };
}
