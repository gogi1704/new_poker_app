const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export function getToken(): string | null {
  return localStorage.getItem("session_token");
}

export function setToken(token: string) {
  localStorage.setItem("session_token", token);
}

export function clearToken() {
  localStorage.removeItem("session_token");
}

// The stored-session fast path (App.tsx, standalone/installed site) never
// re-validates the token up front, so an expired one only surfaces here, on
// whichever request first hits the API. Any caller's 401 should kick the
// whole app back to the "log in again via the bot" screen rather than each
// tab silently rendering an empty state — App.tsx registers that handler.
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

function checkSessionExpired(res: Response) {
  if (res.status === 401) {
    clearToken();
    onSessionExpired?.();
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    checkSessionExpired(res);
    throw new Error(`${path} failed: ${res.status}`);
  }
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const token = getToken();
  // Fastify's JSON body parser rejects an empty body sent with a JSON
  // content-type, so only set the header (and a body) when there's one to send.
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    checkSessionExpired(res);
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `${path} failed: ${res.status}`);
  }
  return res.json();
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "PUT",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    checkSessionExpired(res);
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `${path} failed: ${res.status}`);
  }
  return res.json();
}

export async function authenticate(initData: string) {
  const res = await fetch(`${API_BASE_URL}/api/auth/telegram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  });
  if (!res.ok) throw new Error(`auth failed: ${res.status}`);
  return res.json() as Promise<{
    token: string;
    player: { id: string; nickname: string };
    club: { name: string; logoUrl: string | null } | null;
  }>;
}

// Standalone-site login via a bot-issued link (?login=<token> — see
// App.tsx). Same response shape as authenticate() above.
export async function magicLinkLogin(token: string) {
  const res = await fetch(`${API_BASE_URL}/api/auth/magic-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `auth failed: ${res.status}`);
  }
  return res.json() as Promise<{
    token: string;
    player: { id: string; nickname: string };
    club: { name: string; logoUrl: string | null } | null;
  }>;
}
