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
