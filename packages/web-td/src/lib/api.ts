const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export function getToken(): string | null {
  return localStorage.getItem("td_session_token");
}

export function setToken(token: string) {
  localStorage.setItem("td_session_token", token);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  // Fastify's JSON body parser rejects an empty body sent with a JSON
  // content-type, so only set the header (and a body) when there's one to send.
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `${path} failed: ${res.status}`);
  }
  return res.json();
}

export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: unknown) => request<T>("POST", path, body);
export const apiPut = <T>(path: string, body?: unknown) => request<T>("PUT", path, body);
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);

export async function authenticate(initData: string) {
  const res = await fetch(`${API_BASE_URL}/api/auth/telegram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  });
  if (!res.ok) throw new Error(`auth failed: ${res.status}`);
  return res.json() as Promise<{ token: string; player: { id: string; nickname: string } }>;
}

// A plain <a href> wouldn't carry the Bearer auth header this app uses, so
// the export route is fetched manually and handed to the browser as a
// Blob — the standard way to trigger an authenticated download from an SPA.
export async function downloadTournamentExport(tournamentId: string, name: string) {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/api/td/tournaments/${tournamentId}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]+/g, "_")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function authenticateWithPassword(password: string) {
  const res = await fetch(`${API_BASE_URL}/api/auth/admin-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `auth failed: ${res.status}`);
  }
  return res.json() as Promise<{ token: string; club: { id: string; name: string } }>;
}
