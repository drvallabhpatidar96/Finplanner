import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const TOKEN_KEY = "finplanner_session_token";

let memToken: string | null = null;

export function setToken(token: string | null) {
  memToken = token;
}

export async function loadToken(): Promise<string | null> {
  if (memToken) return memToken;
  const t = await storage.secureGet<string>(TOKEN_KEY, "");
  memToken = t && t.length ? t : null;
  return memToken;
}

export async function saveToken(token: string) {
  memToken = token;
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken() {
  memToken = null;
  await storage.secureRemove(TOKEN_KEY);
}

type Opts = { method?: string; body?: any };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const token = await loadToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) {
    const err: any = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    let detail = "Request failed";
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch {}
    const err: any = new Error(detail);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
